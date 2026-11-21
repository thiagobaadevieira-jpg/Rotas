import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import express from 'express';
import type {NextFunction, Request, Response} from 'express';
import {WebSocket, WebSocketServer} from 'ws';

type UserRole = 'organizador' | 'motorista';
type StopStatus = 'pendente' | 'concluida' | 'nao_entregue';
type RouteStatus = 'planejada' | 'em_andamento' | 'finalizada';

interface StoredUser {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredMarmoraria {
  id: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredRouteStop {
  stopId: string;
  marmorariaId: string;
  nome: string;
  cidade: string;
  telefone: string;
  lat: number;
  lng: number;
  status: StopStatus;
  updatedAt?: string;
}

interface StoredRoute {
  id: string;
  nome: string;
  stops: StoredRouteStop[];
  status: RouteStatus;
  currentDestinationStopId: string | null;
  activeDriverName: string | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredTemplate {
  id: string;
  titulo: string;
  mensagem: string;
}

interface StoredLocation {
  userId: string;
  userName: string;
  role: UserRole;
  lat: number;
  lng: number;
  accuracy?: number;
  routeId?: string | null;
  routeName?: string | null;
  destinationName?: string | null;
  updatedAt: string;
}

interface StoredTeam {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  users: StoredUser[];
  marmorarias: StoredMarmoraria[];
  routes: StoredRoute[];
  templates: StoredTemplate[];
  locations: Record<string, StoredLocation>;
}

interface DataStore {
  teams: Record<string, StoredTeam>;
}

interface AuthPayload {
  userId: string;
  teamId: string;
  role: UserRole;
  exp: number;
}

interface AuthedRequest extends Request {
  auth?: {
    user: StoredUser;
    team: StoredTeam;
  };
}

interface AuthedSocket extends WebSocket {
  teamId?: string;
  userId?: string;
  role?: UserRole;
  isAlive?: boolean;
}

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

function loadStore(): DataStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, {recursive: true});
    }
    if (!fs.existsSync(STORE_PATH)) {
      return {teams: {}};
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as DataStore;
    if (parsed && typeof parsed.teams === 'object' && parsed.teams !== null) {
      return parsed;
    }
  } catch (err) {
    console.error('Erro ao carregar armazenamento da equipe:', err);
  }
  return {teams: {}};
}

function saveStore(store: DataStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  const tmpPath = `${STORE_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

const store: DataStore = loadStore();

function hashPassword(password: string, salt?: string): {salt: string; hash: string} {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return {salt: usedSalt, hash};
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

function signToken(payload: AuthPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): AuthPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as AuthPayload;
    if (!parsed.userId || !parsed.teamId || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toSafeUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function isValidCoords(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function generateTeamCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RV-';
  for (let i = 0; i < 4; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

const ALLOWED_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'maps.google.com.br',
  'www.google.com.br',
  'google.com.br',
]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  if (net.isIP(lower)) {
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    const octets = lower.split('.').map(Number);
    if (octets.length === 4) {
      if (octets[0] === 127 || octets[0] === 10 || octets[0] === 0) return true;
      if (octets[0] === 169 && octets[1] === 254) return true;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
      if (octets[0] === 192 && octets[1] === 168) return true;
    }
  }
  return false;
}

function extractCoordsFromTextOrUrl(text: string): {lat: number; lng: number} | null {
  const pinMatch = text.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (pinMatch) {
    const lat = Number(pinMatch[1]);
    const lng = Number(pinMatch[2]);
    if (isValidCoords(lat, lng)) return {lat, lng};
  }
  const atMatch = text.match(/@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidCoords(lat, lng)) return {lat, lng};
  }
  const paramMatch = text.match(
    /(?:q|ll|query|destination|center|sll)=(-?\d{1,3}\.\d+)(?:%2C|,|\+)\s*(-?\d{1,3}\.\d+)/i
  );
  if (paramMatch) {
    const lat = Number(paramMatch[1]);
    const lng = Number(paramMatch[2]);
    if (isValidCoords(lat, lng)) return {lat, lng};
  }
  return null;
}

function validateAllowedMapsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) return null;
    if (!ALLOWED_MAPS_HOSTS.has(host)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveGoogleMapsLink(startUrl: string): Promise<{
  resolvedUrl: string;
  coordinates: {lat: number; lng: number} | null;
}> {
  let currentUrl = validateAllowedMapsUrl(startUrl);
  if (!currentUrl) {
    throw new Error('Link inválido ou não pertence ao Google Maps.');
  }

  let finalHtml = '';
  for (let hop = 0; hop < 6; hop++) {
    const directCoords = extractCoordsFromTextOrUrl(currentUrl.toString());
    if (directCoords) {
      return {resolvedUrl: currentUrl.toString(), coordinates: directCoords};
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let response: globalThis.Response;
    try {
      response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'RotaVerde/1.0 (+https://maps.google.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    const locationHeader = response.headers.get('location');
    if (locationHeader && response.status >= 300 && response.status < 400) {
      const nextRaw = new URL(locationHeader, currentUrl).toString();
      const nextValid = validateAllowedMapsUrl(nextRaw);
      if (!nextValid) {
        return {resolvedUrl: nextRaw, coordinates: extractCoordsFromTextOrUrl(nextRaw)};
      }
      currentUrl = nextValid;
      continue;
    }

    const text = await response.text();
    finalHtml = text.slice(0, 150000);
    break;
  }

  const fromUrl = extractCoordsFromTextOrUrl(currentUrl.toString());
  if (fromUrl) return {resolvedUrl: currentUrl.toString(), coordinates: fromUrl};

  const fromHtml = extractCoordsFromTextOrUrl(finalHtml);
  return {resolvedUrl: currentUrl.toString(), coordinates: fromHtml};
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({error: 'Autenticação necessária.'});
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({error: 'Sessão expirada ou inválida.'});
    return;
  }
  const team = store.teams[payload.teamId];
  if (!team) {
    res.status(401).json({error: 'Equipe não encontrada.'});
    return;
  }
  const user = team.users.find((u) => u.id === payload.userId);
  if (!user) {
    res.status(401).json({error: 'Usuário não pertence mais a esta equipe.'});
    return;
  }
  req.auth = {user, team};
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  const server = http.createServer(app);
  const wss = new WebSocketServer({server, path: '/ws'});

  function broadcastToTeam(
    teamId: string,
    event: {type: string; payload: unknown},
    organizerOnly = false
  ): void {
    const serialized = JSON.stringify(event);
    wss.clients.forEach((client) => {
      const sock = client as AuthedSocket;
      if (sock.readyState !== WebSocket.OPEN) return;
      if (sock.teamId !== teamId) return;
      if (organizerOnly && sock.role !== 'organizador') return;
      sock.send(serialized);
    });
  }

  wss.on('connection', (ws) => {
    const sock = ws as AuthedSocket;
    sock.isAlive = true;

    sock.on('pong', () => {
      sock.isAlive = true;
    });

    sock.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {type?: string; token?: string};
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const payload = verifyToken(msg.token);
          if (!payload) {
            sock.send(JSON.stringify({type: 'auth:error', error: 'Token inválido'}));
            return;
          }
          const team = store.teams[payload.teamId];
          const user = team?.users.find((u) => u.id === payload.userId);
          if (!team || !user) {
            sock.send(JSON.stringify({type: 'auth:error', error: 'Equipe ou usuário inválido'}));
            return;
          }
          sock.teamId = team.id;
          sock.userId = user.id;
          sock.role = user.role;
          sock.send(JSON.stringify({type: 'auth:ok'}));
        }
      } catch {
        // Ignore malformed WS frames
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const sock = client as AuthedSocket;
      if (sock.isAlive === false) {
        sock.terminate();
        return;
      }
      sock.isAlive = false;
      sock.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  // Public Google Maps link resolver (works in Individual & Team modes)
  app.post('/api/maps/resolve-link', async (req: Request, res: Response) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      res.status(400).json({error: 'Informe um link do Google Maps.'});
      return;
    }
    try {
      const result = await resolveGoogleMapsLink(url);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível ler o link.';
      res.status(400).json({error: message});
    }
  });

  // Create Team + Organizer account
  app.post('/api/team/register', (req: Request, res: Response) => {
    const teamName = typeof req.body?.teamName === 'string' ? req.body.teamName.trim() : '';
    const organizerName =
      typeof req.body?.organizerName === 'string' ? req.body.organizerName.trim() : '';
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (teamName.length < 2 || organizerName.length < 2 || login.length < 3 || password.length < 6) {
      res.status(400).json({
        error:
          'Preencha nome da equipe, seu nome, login (mín. 3 caracteres) e senha (mín. 6 caracteres).',
      });
      return;
    }

    let code = generateTeamCode();
    const existingCodes = new Set(Object.values(store.teams).map((t) => t.code));
    while (existingCodes.has(code)) {
      code = generateTeamCode();
    }

    const teamId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const {salt, hash} = hashPassword(password);

    const organizer: StoredUser = {
      id: userId,
      name: organizerName,
      login,
      role: 'organizador',
      salt,
      passwordHash: hash,
      createdAt: now,
    };

    const incomingMarm = Array.isArray(req.body?.marmorarias) ? req.body.marmorarias : [];
    const incomingRoutes = Array.isArray(req.body?.routes) ? req.body.routes : [];
    const incomingTemplates = Array.isArray(req.body?.templates) ? req.body.templates : [];

    const marmorarias: StoredMarmoraria[] = incomingMarm
      .filter(
        (m: StoredMarmoraria) =>
          m &&
          typeof m.nome === 'string' &&
          typeof m.cidade === 'string' &&
          isValidCoords(m.lat, m.lng)
      )
      .slice(0, 500)
      .map((m: StoredMarmoraria) => ({
        id: typeof m.id === 'string' ? m.id : crypto.randomUUID(),
        nome: m.nome.trim(),
        cidade: m.cidade.trim(),
        telefone: typeof m.telefone === 'string' ? m.telefone.trim() : '',
        lat: m.lat,
        lng: m.lng,
        isDemo: Boolean(m.isDemo),
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : now,
        updatedAt: now,
      }));

    const routes: StoredRoute[] = incomingRoutes
      .filter((r: StoredRoute) => r && typeof r.nome === 'string' && Array.isArray(r.stops))
      .slice(0, 200)
      .map((r: StoredRoute) => ({
        id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
        nome: r.nome.trim(),
        stops: r.stops.filter((s) => s && isValidCoords(s.lat, s.lng)),
        status: r.status === 'em_andamento' || r.status === 'finalizada' ? r.status : 'planejada',
        currentDestinationStopId:
          typeof r.currentDestinationStopId === 'string' ? r.currentDestinationStopId : null,
        activeDriverName: typeof r.activeDriverName === 'string' ? r.activeDriverName : null,
        createdByUserId: userId,
        createdByName: organizerName,
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : now,
        updatedAt: now,
      }));

    const templates: StoredTemplate[] = incomingTemplates
      .filter((t: StoredTemplate) => t && typeof t.titulo === 'string' && typeof t.mensagem === 'string')
      .slice(0, 50)
      .map((t: StoredTemplate) => ({
        id: typeof t.id === 'string' ? t.id : crypto.randomUUID(),
        titulo: t.titulo.trim(),
        mensagem: t.mensagem.trim(),
      }));

    store.teams[teamId] = {
      id: teamId,
      name: teamName,
      code,
      createdAt: now,
      users: [organizer],
      marmorarias,
      routes,
      templates,
      locations: {},
    };
    saveStore(store);

    const token = signToken({
      userId,
      teamId,
      role: 'organizador',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      token,
      teamId,
      teamName,
      teamCode: code,
      user: toSafeUser(organizer),
    });
  });

  // Login into Team (Organizer or Driver)
  app.post('/api/team/login', (req: Request, res: Response) => {
    const teamCode =
      typeof req.body?.teamCode === 'string' ? req.body.teamCode.trim().toUpperCase() : '';
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!teamCode || !login || !password) {
      res.status(400).json({error: 'Informe código da equipe, login e senha.'});
      return;
    }

    const team = Object.values(store.teams).find((t) => t.code.toUpperCase() === teamCode);
    if (!team) {
      res.status(401).json({error: 'Equipe, login ou senha incorretos.'});
      return;
    }

    const user = team.users.find((u) => u.login.toLowerCase() === login);
    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      res.status(401).json({error: 'Equipe, login ou senha incorretos.'});
      return;
    }

    const token = signToken({
      userId: user.id,
      teamId: team.id,
      role: user.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      teamId: team.id,
      teamName: team.name,
      teamCode: team.code,
      user: toSafeUser(user),
    });
  });

  // Get full synchronized state for authenticated user's team
  app.get('/api/team/state', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    res.json({
      team: {
        id: team.id,
        name: team.name,
        code: team.code,
      },
      user: toSafeUser(user),
      users: team.users.map(toSafeUser),
      marmorarias: team.marmorarias,
      routes: team.routes,
      templates: team.templates,
      locations: user.role === 'organizador' ? Object.values(team.locations) : [],
    });
  });

  // Add driver (Organizer only, max 2 drivers per team)
  app.post('/api/team/drivers', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    if (user.role !== 'organizador') {
      res.status(403).json({error: 'Somente o organizador pode cadastrar motoristas.'});
      return;
    }

    const currentDrivers = team.users.filter((u) => u.role === 'motorista');
    if (currentDrivers.length >= 2) {
      res.status(400).json({error: 'Limite atingido: máximo de 2 motoristas por equipe.'});
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (name.length < 2 || login.length < 3 || password.length < 6) {
      res
        .status(400)
        .json({error: 'Informe nome, login (mín. 3 caracteres) e senha (mín. 6 caracteres).'});
      return;
    }

    if (team.users.some((u) => u.login.toLowerCase() === login)) {
      res.status(409).json({error: 'Já existe um membro com esse login nesta equipe.'});
      return;
    }

    const {salt, hash} = hashPassword(password);
    const driver: StoredUser = {
      id: crypto.randomUUID(),
      name,
      login,
      role: 'motorista',
      salt,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };

    team.users.push(driver);
    saveStore(store);

    const safeUsers = team.users.map(toSafeUser);
    broadcastToTeam(team.id, {type: 'team:users_updated', payload: safeUsers});
    res.status(201).json({user: toSafeUser(driver), users: safeUsers});
  });

  // Remove driver (Organizer only)
  app.delete('/api/team/drivers/:driverId', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    if (user.role !== 'organizador') {
      res.status(403).json({error: 'Somente o organizador pode remover motoristas.'});
      return;
    }
    const {driverId} = req.params;
    const target = team.users.find((u) => u.id === driverId && u.role === 'motorista');
    if (!target) {
      res.status(404).json({error: 'Motorista não encontrado.'});
      return;
    }

    team.users = team.users.filter((u) => u.id !== driverId);
    delete team.locations[driverId];
    saveStore(store);

    const safeUsers = team.users.map(toSafeUser);
    broadcastToTeam(team.id, {type: 'team:users_updated', payload: safeUsers});
    broadcastToTeam(
      team.id,
      {type: 'team:locations_updated', payload: Object.values(team.locations)},
      true
    );
    res.json({users: safeUsers});
  });

  // Save/upsert marmoraria
  app.post('/api/team/marmorarias', requireAuth, (req: AuthedRequest, res: Response) => {
    const {team} = req.auth!;
    const m = req.body as Partial<StoredMarmoraria>;
    if (
      !m ||
      typeof m.nome !== 'string' ||
      typeof m.cidade !== 'string' ||
      !isValidCoords(m.lat, m.lng)
    ) {
      res.status(400).json({error: 'Dados da marmoraria ou coordenadas inválidas.'});
      return;
    }

    const now = new Date().toISOString();
    const existingIdx = m.id ? team.marmorarias.findIndex((item) => item.id === m.id) : -1;

    const record: StoredMarmoraria = {
      id: existingIdx >= 0 ? team.marmorarias[existingIdx].id : m.id || crypto.randomUUID(),
      nome: m.nome.trim(),
      cidade: m.cidade.trim(),
      telefone: typeof m.telefone === 'string' ? m.telefone.trim() : '',
      lat: m.lat!,
      lng: m.lng!,
      isDemo: Boolean(m.isDemo),
      createdAt: existingIdx >= 0 ? team.marmorarias[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      team.marmorarias[existingIdx] = record;
    } else {
      team.marmorarias.unshift(record);
    }

    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:marmorarias_updated', payload: team.marmorarias});
    res.json({marmoraria: record, marmorarias: team.marmorarias});
  });

  app.delete('/api/team/marmorarias/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const {team} = req.auth!;
    team.marmorarias = team.marmorarias.filter((m) => m.id !== req.params.id);
    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:marmorarias_updated', payload: team.marmorarias});
    res.json({marmorarias: team.marmorarias});
  });

  // Create route (records creator from authenticated user)
  app.post('/api/team/routes', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    const body = req.body as Partial<StoredRoute>;
    if (!body || typeof body.nome !== 'string' || body.nome.trim().length === 0) {
      res.status(400).json({error: 'Informe o nome da rota.'});
      return;
    }

    const now = new Date().toISOString();
    const stops: StoredRouteStop[] = Array.isArray(body.stops)
      ? body.stops.filter((s) => s && isValidCoords(s.lat, s.lng))
      : [];

    const route: StoredRoute = {
      id: body.id || crypto.randomUUID(),
      nome: body.nome.trim(),
      stops,
      status: stops.length > 0 && body.status === 'em_andamento' ? 'em_andamento' : 'planejada',
      currentDestinationStopId: null,
      activeDriverName: null,
      createdByUserId: user.id,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
    };

    team.routes.unshift(route);
    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:routes_updated', payload: team.routes});
    res.status(201).json({route, routes: team.routes});
  });

  // Update route (stops, order, status, current destination, rename)
  app.put('/api/team/routes/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const {team} = req.auth!;
    const idx = team.routes.findIndex((r) => r.id === req.params.id);
    if (idx < 0) {
      res.status(404).json({error: 'Rota não encontrada.'});
      return;
    }

    const existing = team.routes[idx];
    const body = req.body as Partial<StoredRoute>;
    const updated: StoredRoute = {
      ...existing,
      nome: typeof body.nome === 'string' && body.nome.trim() ? body.nome.trim() : existing.nome,
      stops: Array.isArray(body.stops)
        ? body.stops.filter((s) => s && isValidCoords(s.lat, s.lng))
        : existing.stops,
      status:
        body.status === 'planejada' || body.status === 'em_andamento' || body.status === 'finalizada'
          ? body.status
          : existing.status,
      currentDestinationStopId:
        body.currentDestinationStopId === undefined
          ? existing.currentDestinationStopId
          : body.currentDestinationStopId,
      activeDriverName:
        body.activeDriverName === undefined ? existing.activeDriverName : body.activeDriverName,
      updatedAt: new Date().toISOString(),
    };

    team.routes[idx] = updated;
    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:routes_updated', payload: team.routes});
    res.json({route: updated, routes: team.routes});
  });

  app.delete('/api/team/routes/:id', requireAuth, (req: AuthedRequest, res: Response) => {
    const {team} = req.auth!;
    team.routes = team.routes.filter((r) => r.id !== req.params.id);
    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:routes_updated', payload: team.routes});
    res.json({routes: team.routes});
  });

  // Update WhatsApp templates
  app.put('/api/team/templates', requireAuth, (req: AuthedRequest, res: Response) => {
    const {team} = req.auth!;
    const list = Array.isArray(req.body?.templates) ? req.body.templates : null;
    if (!list) {
      res.status(400).json({error: 'Lista de mensagens inválida.'});
      return;
    }

    team.templates = list
      .filter((t: StoredTemplate) => t && typeof t.titulo === 'string' && typeof t.mensagem === 'string')
      .slice(0, 50)
      .map((t: StoredTemplate) => ({
        id: t.id || crypto.randomUUID(),
        titulo: t.titulo.trim(),
        mensagem: t.mensagem.trim(),
      }));

    saveStore(store);
    broadcastToTeam(team.id, {type: 'team:templates_updated', payload: team.templates});
    res.json({templates: team.templates});
  });

  // Driver pushes live location while executing route with app open
  app.post('/api/team/location', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    const {lat, lng, accuracy, routeId, routeName, destinationName} = req.body ?? {};
    if (!isValidCoords(lat, lng)) {
      res.status(400).json({error: 'Coordenadas inválidas.'});
      return;
    }

    const loc: StoredLocation = {
      userId: user.id,
      userName: user.name,
      role: user.role,
      lat,
      lng,
      accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : undefined,
      routeId: typeof routeId === 'string' ? routeId : null,
      routeName: typeof routeName === 'string' ? routeName : null,
      destinationName: typeof destinationName === 'string' ? destinationName : null,
      updatedAt: new Date().toISOString(),
    };

    team.locations[user.id] = loc;
    saveStore(store);

    // Strictly broadcast locations ONLY to the organizer(s) of this team
    broadcastToTeam(
      team.id,
      {type: 'team:locations_updated', payload: Object.values(team.locations)},
      true
    );
    res.json({ok: true, updatedAt: loc.updatedAt});
  });

  // Organizer fetches last driver locations
  app.get('/api/team/locations', requireAuth, (req: AuthedRequest, res: Response) => {
    const {user, team} = req.auth!;
    if (user.role !== 'organizador') {
      res.status(403).json({error: 'Somente o organizador pode acompanhar os motoristas.'});
      return;
    }
    res.json({locations: Object.values(team.locations)});
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Rota Verde server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
