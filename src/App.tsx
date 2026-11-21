import {Compass, MapPin, Route as RouteIcon, WifiOff} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AddStopsModal} from './components/AddStopsModal.tsx';
import {AddressesView} from './components/AddressesView.tsx';
import {CreateRouteModal} from './components/CreateRouteModal.tsx';
import {LocateView} from './components/LocateView.tsx';
import {MarmorariaModal} from './components/MarmorariaModal.tsx';
import {RouteDetailView} from './components/RouteDetailView.tsx';
import {RoutesListView} from './components/RoutesListView.tsx';
import {TeamDrawer} from './components/TeamDrawer.tsx';
import {WhatsAppModal} from './components/WhatsAppModal.tsx';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  DEMO_MARMORARIAS,
  DEMO_ROUTES,
} from './data/demoData.ts';
import {useOnlineStatus} from './hooks/useOnlineStatus.ts';
import type {
  Coordinates,
  DriverLocation,
  Marmoraria,
  RoutePlan,
  RouteStop,
  TabId,
  TeamSession,
  TeamUser,
  WhatsAppTemplate,
} from './types.ts';
import {extractFirstUrl, isGoogleMapsUrl, parseCoordinatesInput} from './utils/geo.ts';

const LS_MARMORARIAS = 'rv_marmorarias_v1';
const LS_ROUTES = 'rv_routes_v1';
const LS_TEMPLATES = 'rv_templates_v1';
const LS_LOCAL_NAME = 'rv_local_user_name_v1';
const LS_TEAM_SESSION = 'rv_team_session_v1';
const LS_DIRECT_TRAVEL = 'rv_direct_travel_v1';

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const isOnline = useOnlineStatus();

  // Individual mode persistent state
  const [localMarmorarias, setLocalMarmorarias] = useState<Marmoraria[]>(() =>
    readLocalJson(LS_MARMORARIAS, DEMO_MARMORARIAS)
  );
  const [localRoutes, setLocalRoutes] = useState<RoutePlan[]>(() =>
    readLocalJson(LS_ROUTES, DEMO_ROUTES)
  );
  const [localTemplates, setLocalTemplates] = useState<WhatsAppTemplate[]>(() =>
    readLocalJson(LS_TEMPLATES, DEFAULT_WHATSAPP_TEMPLATES)
  );
  const [localUserName, setLocalUserName] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_LOCAL_NAME) || 'Thiago';
    } catch {
      return 'Thiago';
    }
  });

  // Team mode persistent authenticated state
  const [session, setSession] = useState<TeamSession | null>(() =>
    readLocalJson<TeamSession | null>(LS_TEAM_SESSION, null)
  );
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamMarmorarias, setTeamMarmorarias] = useState<Marmoraria[]>([]);
  const [teamRoutes, setTeamRoutes] = useState<RoutePlan[]>([]);
  const [teamTemplates, setTeamTemplates] = useState<WhatsAppTemplate[]>([]);
  const [driverLocations, setDriverLocations] = useState<DriverLocation[]>([]);

  // Active data based on mode
  const marmorarias = session ? teamMarmorarias : localMarmorarias;
  const routes = session ? teamRoutes : localRoutes;
  const templates = session ? teamTemplates : localTemplates;
  const currentUserName = session ? session.user.name : localUserName || 'Você';

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<TabId>('rotas');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [teamDrawerOpen, setTeamDrawerOpen] = useState(false);
  const [createRouteOpen, setCreateRouteOpen] = useState(false);
  const [addStopsOpen, setAddStopsOpen] = useState(false);

  // Marmoraria Modal state
  const [marmModalOpen, setMarmModalOpen] = useState(false);
  const [editingMarm, setEditingMarm] = useState<Marmoraria | null>(null);
  const [marmModalCoords, setMarmModalCoords] = useState<Coordinates | null>(null);
  const [marmModalName, setMarmModalName] = useState<string>('');
  const [marmModalMapOpen, setMarmModalMapOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [directTravel, setDirectTravel] = useState<{
    driverName: string;
    destinationName: string;
    marmorariaId: string | null;
    routeId: string | null;
    updatedAt: string;
  } | null>(() => readLocalJson(LS_DIRECT_TRAVEL, null));

  // WhatsApp Modal state
  const [whatsAppTarget, setWhatsAppTarget] = useState<{
    name: string;
    phone: string;
  } | null>(null);

  // Browser Geolocation state
  const [userPosition, setUserPosition] = useState<Coordinates | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const lastSentLocRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Persist local mode changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_MARMORARIAS, JSON.stringify(localMarmorarias));
    } catch {
      // Ignore storage quota errors
    }
  }, [localMarmorarias]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ROUTES, JSON.stringify(localRoutes));
    } catch {
      // Ignore storage quota errors
    }
  }, [localRoutes]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TEMPLATES, JSON.stringify(localTemplates));
    } catch {
      // Ignore storage quota errors
    }
  }, [localTemplates]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LOCAL_NAME, localUserName);
    } catch {
      // Ignore storage errors
    }
  }, [localUserName]);

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(LS_TEAM_SESSION, JSON.stringify(session));
      } else {
        localStorage.removeItem(LS_TEAM_SESSION);
      }
    } catch {
      // Ignore storage errors
    }
  }, [session]);

  useEffect(() => {
    try {
      if (directTravel) {
        localStorage.setItem(LS_DIRECT_TRAVEL, JSON.stringify(directTravel));
      } else {
        localStorage.removeItem(LS_DIRECT_TRAVEL);
      }
    } catch {
      // Ignore storage errors
    }
  }, [directTravel]);

  // Handle PWA Web Share Target incoming URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTitle = params.get('title') || '';
    const sharedText = params.get('text') || '';
    const sharedUrl = params.get('url') || '';
    const isShareRoute = window.location.pathname === '/share-target';

    if (!isShareRoute && !sharedUrl && !sharedText && !sharedTitle) {
      return;
    }

    const combined = `${sharedUrl} ${sharedText}`.trim();
    window.history.replaceState({}, '', '/');

    const handleShare = async () => {
      setActiveTab('enderecos');
      setSelectedRouteId(null);
      setEditingMarm(null);
      setMarmModalMapOpen(false);

      // Clean name hint from title
      const cleanName = sharedTitle
        .replace(/-\s*Google Maps$/i, '')
        .replace(/Google Maps/i, '')
        .trim();
      setMarmModalName(cleanName);

      const directCoords = parseCoordinatesInput(combined);
      if (directCoords) {
        setMarmModalCoords(directCoords);
        setShareNotice('Local recebido do Google Maps com coordenadas preenchidas.');
        setMarmModalOpen(true);
        return;
      }

      const candidateUrl = extractFirstUrl(combined);
      if (candidateUrl && isGoogleMapsUrl(candidateUrl)) {
        try {
          const res = await fetch('/api/maps/resolve-link', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url: candidateUrl}),
          });
          const data = (await res.json()) as {coordinates?: Coordinates | null};
          if (data.coordinates) {
            setMarmModalCoords(data.coordinates);
            setShareNotice('Link do Google Maps lido e coordenadas preenchidas.');
            setMarmModalOpen(true);
            return;
          }
        } catch {
          // Fall through to manual coordinate instruction
        }
      }

      setMarmModalCoords(null);
      setShareNotice(
        'Não foi possível extrair as coordenadas automaticamente deste compartilhamento. Cole as coordenadas manualmente abaixo ou marque o ponto no mapa.'
      );
      setMarmModalOpen(true);
    };

    void handleShare();
  }, []);

  // Load initial team state & connect WebSocket when signed in
  const fetchTeamState = useCallback(async (activeSession: TeamSession) => {
    try {
      const res = await fetch('/api/team/state', {
        headers: {Authorization: `Bearer ${activeSession.token}`},
      });
      if (res.status === 401) {
        setSession(null);
        setTeamUsers([]);
        setDriverLocations([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        users: TeamUser[];
        marmorarias: Marmoraria[];
        routes: RoutePlan[];
        templates: WhatsAppTemplate[];
        locations: DriverLocation[];
      };
      setTeamUsers(data.users || []);
      setTeamMarmorarias(data.marmorarias || []);
      setTeamRoutes(data.routes || []);
      setTeamTemplates(
        data.templates && data.templates.length > 0 ? data.templates : DEFAULT_WHATSAPP_TEMPLATES
      );
      setDriverLocations(data.locations || []);
    } catch {
      // Ignore transient network errors
    }
  }, []);

  useEffect(() => {
    if (!session) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    void fetchTeamState(session);

    let closedByEffect = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      if (closedByEffect) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({type: 'auth', token: session.token}));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {type: string; payload: unknown};
          if (msg.type === 'team:users_updated') {
            setTeamUsers(msg.payload as TeamUser[]);
          } else if (msg.type === 'team:marmorarias_updated') {
            setTeamMarmorarias(msg.payload as Marmoraria[]);
          } else if (msg.type === 'team:routes_updated') {
            setTeamRoutes(msg.payload as RoutePlan[]);
          } else if (msg.type === 'team:templates_updated') {
            setTeamTemplates(msg.payload as WhatsAppTemplate[]);
          } else if (msg.type === 'team:locations_updated') {
            setDriverLocations(msg.payload as DriverLocation[]);
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connectWs, 3500);
        }
      };
    };

    connectWs();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [session, fetchTeamState]);

  const activeRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) || null,
    [routes, selectedRouteId]
  );

  const activeInProgressRoute = useMemo(
    () => routes.find((r) => r.status === 'em_andamento') || null,
    [routes]
  );

  // Request / Watch Geolocation when viewing a route OR when a team driver has a route in progress
  const shouldWatchGeo = Boolean(
    selectedRouteId || (session && activeInProgressRoute)
  );

  const requestGeolocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Seu navegador não suporta geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPosition({lat: pos.coords.latitude, lng: pos.coords.longitude});
        setGeoError(null);
      },
      () => {
        setGeoError('Permissão de localização recusada ou indisponível.');
      },
      {enableHighAccuracy: true, timeout: 10000}
    );
  }, []);

  useEffect(() => {
    if (!shouldWatchGeo || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        setUserPosition(coords);
        setGeoError(null);

        // If authenticated and executing a route with app open, share location with organizer
        const runningRoute = activeRoute?.status === 'em_andamento' ? activeRoute : activeInProgressRoute;
        if (session && runningRoute) {
          const now = Date.now();
          if (now - lastSentLocRef.current >= 12000) {
            lastSentLocRef.current = now;
            const destStop = runningRoute.stops.find(
              (s) => s.stopId === runningRoute.currentDestinationStopId
            );
            void fetch('/api/team/location', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.token}`,
              },
              body: JSON.stringify({
                lat: coords.lat,
                lng: coords.lng,
                accuracy: pos.coords.accuracy,
                routeId: runningRoute.id,
                routeName: runningRoute.nome,
                destinationName: destStop?.nome || null,
              }),
            }).catch(() => {});
          }
        }
      },
      () => {
        setGeoError('Localização indisponível. Verifique a permissão do navegador.');
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 15000}
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [shouldWatchGeo, session, activeRoute, activeInProgressRoute]);

  // Helper to update route in local or team mode
  const persistRouteUpdate = useCallback(
    async (updatedRoute: RoutePlan) => {
      if (session) {
        setTeamRoutes((prev) => prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)));
        try {
          await fetch(`/api/team/routes/${updatedRoute.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.token}`,
            },
            body: JSON.stringify(updatedRoute),
          });
        } catch {
          // Next WS sync reconciles
        }
      } else {
        setLocalRoutes((prev) => prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)));
      }
    },
    [session]
  );

  // Opening a route with stops automatically marks it as "em_andamento"
  const handleOpenRoute = useCallback(
    (routeId: string) => {
      const target = routes.find((r) => r.id === routeId);
      setActiveTab('rotas');
      setSelectedRouteId(routeId);

      if (target && target.stops.length > 0 && target.status !== 'em_andamento') {
        const nextRoute: RoutePlan = {
          ...target,
          status: 'em_andamento',
          activeDriverName: target.activeDriverName || currentUserName,
          updatedAt: new Date().toISOString(),
        };
        void persistRouteUpdate(nextRoute);
      }
    },
    [routes, currentUserName, persistRouteUpdate]
  );

  const handleCreateRoute = async (nome: string, selectedMarmIds: string[]) => {
    const now = new Date().toISOString();
    const stops: RouteStop[] = selectedMarmIds
      .map((mId, index): RouteStop | null => {
        const m = marmorarias.find((item) => item.id === mId);
        if (!m) return null;
        return {
          stopId: `stop-${Date.now()}-${index}`,
          marmorariaId: m.id,
          nome: m.nome,
          cidade: m.cidade,
          telefone: m.telefone,
          lat: m.lat,
          lng: m.lng,
          status: 'pendente',
        };
      })
      .filter((s): s is RouteStop => s !== null);

    const newRoute: RoutePlan = {
      id: `route-${Date.now()}`,
      nome,
      stops,
      status: stops.length > 0 ? 'em_andamento' : 'planejada',
      currentDestinationStopId: null,
      activeDriverName: stops.length > 0 ? currentUserName : null,
      createdByUserId: session?.user.id || 'local-user',
      createdByName: session?.user.name || localUserName || 'Modo Individual',
      createdAt: now,
      updatedAt: now,
    };

    if (session) {
      setTeamRoutes((prev) => [newRoute, ...prev]);
      try {
        const res = await fetch('/api/team/routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(newRoute),
        });
        if (res.ok) {
          const data = (await res.json()) as {route: RoutePlan};
          setSelectedRouteId(data.route.id);
          setActiveTab('rotas');
          return;
        }
      } catch {
        // Fallback optimistic ID
      }
    } else {
      setLocalRoutes((prev) => [newRoute, ...prev]);
    }
    setActiveTab('rotas');
    setSelectedRouteId(newRoute.id);
  };

  const handleRenameRoute = (routeId: string, newName: string) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;
    void persistRouteUpdate({...target, nome: newName, updatedAt: new Date().toISOString()});
  };

  const handleDeleteRoute = async (routeId: string) => {
    setSelectedRouteId(null);
    if (session) {
      setTeamRoutes((prev) => prev.filter((r) => r.id !== routeId));
      await fetch(`/api/team/routes/${routeId}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${session.token}`},
      }).catch(() => {});
    } else {
      setLocalRoutes((prev) => prev.filter((r) => r.id !== routeId));
    }
  };

  const handleApplyRouteStops = (selectedMarmIds: string[]) => {
    if (!activeRoute) return;

    const existingByMarmId = new Map<string, RouteStop>();
    activeRoute.stops.forEach((s) => existingByMarmId.set(s.marmorariaId, s));

    const nextPending: RouteStop[] = [];
    const nextFinished: RouteStop[] = [];

    selectedMarmIds.forEach((mId, idx) => {
      const existing = existingByMarmId.get(mId);
      if (existing) {
        if (existing.status === 'pendente') nextPending.push(existing);
        else nextFinished.push(existing);
      } else {
        const m = marmorarias.find((item) => item.id === mId);
        if (m) {
          nextPending.push({
            stopId: `stop-${Date.now()}-${idx}`,
            marmorariaId: m.id,
            nome: m.nome,
            cidade: m.cidade,
            telefone: m.telefone,
            lat: m.lat,
            lng: m.lng,
            status: 'pendente',
          });
        }
      }
    });

    const combined = [...nextPending, ...nextFinished];
    const nextRoute: RoutePlan = {
      ...activeRoute,
      stops: combined,
      status: nextPending.length > 0 ? 'em_andamento' : activeRoute.status,
      activeDriverName: activeRoute.activeDriverName || currentUserName,
      updatedAt: new Date().toISOString(),
    };
    void persistRouteUpdate(nextRoute);
  };

  const pushImmediateDestinationLocation = useCallback(
    (destinationName: string, routeObj?: RoutePlan | null) => {
      if (!session || !userPosition) return;
      void fetch('/api/team/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          lat: userPosition.lat,
          lng: userPosition.lng,
          routeId: routeObj?.id || null,
          routeName: routeObj?.nome || null,
          destinationName,
        }),
      }).catch(() => {});
    },
    [session, userPosition]
  );

  const handleSelectDestination = (routeId: string, stopId: string, forceSelect = false) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;
    const isAlready = target.currentDestinationStopId === stopId;
    const nextDestId = forceSelect ? stopId : isAlready ? null : stopId;
    const destStop = nextDestId ? target.stops.find((s) => s.stopId === nextDestId) : null;
    const now = new Date().toISOString();

    if (destStop) {
      setDirectTravel({
        driverName: currentUserName,
        destinationName: destStop.nome,
        marmorariaId: destStop.marmorariaId,
        routeId: target.id,
        updatedAt: now,
      });
      pushImmediateDestinationLocation(destStop.nome, target);
    } else if (directTravel?.routeId === target.id) {
      setDirectTravel(null);
    }

    void persistRouteUpdate({
      ...target,
      status: 'em_andamento',
      currentDestinationStopId: nextDestId,
      activeDriverName: currentUserName,
      updatedAt: now,
    });
  };

  const handleNavigateMapsFromAddress = (m: Marmoraria) => {
    const now = new Date().toISOString();
    // If this marmoraria belongs to an in-progress (or planned) route's pending stops, mark it as current destination
    const candidateRoute =
      routes.find(
        (r) =>
          r.status === 'em_andamento' &&
          r.stops.some((s) => s.marmorariaId === m.id && s.status === 'pendente')
      ) ||
      routes.find((r) => r.stops.some((s) => s.marmorariaId === m.id && s.status === 'pendente')) ||
      null;

    if (candidateRoute) {
      const matchingStop = candidateRoute.stops.find(
        (s) => s.marmorariaId === m.id && s.status === 'pendente'
      );
      if (matchingStop) {
        void persistRouteUpdate({
          ...candidateRoute,
          status: 'em_andamento',
          currentDestinationStopId: matchingStop.stopId,
          activeDriverName: currentUserName,
          updatedAt: now,
        });
      }
    }

    setDirectTravel({
      driverName: currentUserName,
      destinationName: m.nome,
      marmorariaId: m.id,
      routeId: candidateRoute?.id || null,
      updatedAt: now,
    });
    pushImmediateDestinationLocation(m.nome, candidateRoute);
  };

  const handleReorderPendingStops = (routeId: string, orderedStopIds: string[]) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;

    const pending = target.stops.filter((s) => s.status === 'pendente');
    const finished = target.stops.filter((s) => s.status !== 'pendente');
    const byId = new Map(pending.map((s) => [s.stopId, s]));
    const reordered = orderedStopIds
      .map((id) => byId.get(id))
      .filter((s): s is RouteStop => Boolean(s));
    pending.forEach((s) => {
      if (!orderedStopIds.includes(s.stopId)) reordered.push(s);
    });

    void persistRouteUpdate({
      ...target,
      stops: [...reordered, ...finished],
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateStopStatus = (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue'
  ) => {
    const target = routes.find((r) => r.id === routeId);
    if (!target) return;

    const now = new Date().toISOString();
    const updatedStops = target.stops.map((s) =>
      s.stopId === stopId ? {...s, status, updatedAt: now} : s
    );

    // Move concluída / não entregue to the end of the list; keep pending at top
    const pending = updatedStops.filter((s) => s.status === 'pendente');
    const finished = updatedStops.filter((s) => s.status !== 'pendente');

    const nextDest =
      target.currentDestinationStopId === stopId && status !== 'pendente'
        ? null
        : target.currentDestinationStopId;

    const nextStatus =
      pending.length === 0 && finished.length > 0
        ? 'finalizada'
        : pending.length > 0
        ? 'em_andamento'
        : target.status;

    if (target.currentDestinationStopId === stopId && status !== 'pendente') {
      setDirectTravel((prev) => (prev?.routeId === routeId ? null : prev));
    }

    void persistRouteUpdate({
      ...target,
      stops: [...pending, ...finished],
      currentDestinationStopId: nextDest,
      status: nextStatus,
      updatedAt: now,
    });
  };

  const handleSaveMarmoraria = async (data: {
    id?: string;
    nome: string;
    cidade: string;
    telefone: string;
    lat: number;
    lng: number;
  }) => {
    const now = new Date().toISOString();
    const record: Marmoraria = {
      id: data.id || `marm-${Date.now()}`,
      nome: data.nome,
      cidade: data.cidade,
      telefone: data.telefone,
      lat: data.lat,
      lng: data.lng,
      isDemo: false,
      createdAt: editingMarm?.createdAt || now,
      updatedAt: now,
    };

    if (session) {
      setTeamMarmorarias((prev) => {
        const exists = prev.some((m) => m.id === record.id);
        return exists ? prev.map((m) => (m.id === record.id ? record : m)) : [record, ...prev];
      });
      await fetch('/api/team/marmorarias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(record),
      }).catch(() => {});
    } else {
      setLocalMarmorarias((prev) => {
        const exists = prev.some((m) => m.id === record.id);
        return exists ? prev.map((m) => (m.id === record.id ? record : m)) : [record, ...prev];
      });
    }
    setShareNotice(null);
  };

  const handleDeleteMarmoraria = async (id: string) => {
    if (session) {
      setTeamMarmorarias((prev) => prev.filter((m) => m.id !== id));
      await fetch(`/api/team/marmorarias/${id}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${session.token}`},
      }).catch(() => {});
    } else {
      setLocalMarmorarias((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const handleSaveTemplates = async (nextTemplates: WhatsAppTemplate[]) => {
    if (session) {
      setTeamTemplates(nextTemplates);
      await fetch('/api/team/templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({templates: nextTemplates}),
      }).catch(() => {});
    } else {
      setLocalTemplates(nextTemplates);
    }
  };

  const openNewMarmoraria = (openInMap = false) => {
    setEditingMarm(null);
    setMarmModalCoords(null);
    setMarmModalName('');
    setShareNotice(null);
    setMarmModalMapOpen(openInMap);
    setMarmModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#0d100e] pb-24 text-[#f3f5f2]">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#1f2620] bg-[#0d100e]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-13 max-w-6xl items-center justify-center px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setTeamDrawerOpen(true)}
            className="text-base font-extrabold tracking-tight text-[#f3f5f2] whitespace-nowrap"
          >
            Rota <span className="text-[#baff27]">Verde</span>
          </button>

          {!isOnline && (
            <div className="absolute right-4 flex items-center sm:right-6">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ff873f]">
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
        {(() => {
          const activeRouteWithDest =
            routes.find((r) => {
              if (!r.currentDestinationStopId) return false;
              return r.stops.some(
                (s) => s.stopId === r.currentDestinationStopId && s.status === 'pendente'
              );
            }) || null;
          const activeStopFromRoute = activeRouteWithDest
            ? activeRouteWithDest.stops.find(
                (s) => s.stopId === activeRouteWithDest.currentDestinationStopId
              ) || null
            : null;

          const activeDestinationMarmId =
            activeStopFromRoute?.marmorariaId || directTravel?.marmorariaId || null;

          return (
            <>
              {activeTab === 'rotas' && !activeRoute && (
                <RoutesListView
                  routes={routes}
                  onOpenRoute={handleOpenRoute}
                  onCreateRoute={() => setCreateRouteOpen(true)}
                />
              )}

              {activeTab === 'rotas' && activeRoute && (
                <RouteDetailView
                  route={activeRoute}
                  userPosition={userPosition}
                  geoError={geoError}
                  onBack={() => setSelectedRouteId(null)}
                  onRequestGeo={requestGeolocation}
                  onRenameRoute={handleRenameRoute}
                  onDeleteRoute={(id) => void handleDeleteRoute(id)}
                  onOpenAddStops={() => setAddStopsOpen(true)}
                  onSelectDestination={handleSelectDestination}
                  onReorderPendingStops={handleReorderPendingStops}
                  onUpdateStopStatus={handleUpdateStopStatus}
                  onOpenWhatsApp={(stop) =>
                    setWhatsAppTarget({name: stop.nome, phone: stop.telefone})
                  }
                />
              )}

              {activeTab === 'enderecos' && (
                <AddressesView
                  marmorarias={marmorarias}
                  activeDestinationMarmId={activeDestinationMarmId}
                  onCreateNew={(openInMap) => openNewMarmoraria(Boolean(openInMap))}
                  onEdit={(m) => {
                    setEditingMarm(m);
                    setMarmModalCoords({lat: m.lat, lng: m.lng});
                    setMarmModalName('');
                    setShareNotice(null);
                    setMarmModalMapOpen(false);
                    setMarmModalOpen(true);
                  }}
                  onDelete={(id) => void handleDeleteMarmoraria(id)}
                  onOpenWhatsApp={(m) => setWhatsAppTarget({name: m.nome, phone: m.telefone})}
                  onNavigateMaps={handleNavigateMapsFromAddress}
                />
              )}

              {activeTab === 'localizar' && (
                <LocateView
                  session={session}
                  teamUsers={teamUsers}
                  routes={routes}
                  driverLocations={driverLocations}
                  isSharingOwnLocation={Boolean(session && activeInProgressRoute && userPosition)}
                  onRefreshLocations={() => session && void fetchTeamState(session)}
                  onOpenTeamMenu={() => setTeamDrawerOpen(true)}
                />
              )}
            </>
          );
        })()}
      </main>

      {/* Fixed Bottom Navigation Bar (3 Tabs) */}
      <nav
        aria-label="Navegação principal"
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-[#1f2620] bg-[#0d100e]/95 backdrop-blur-md pb-safe"
      >
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-3 items-center">
          {(
            [
              {id: 'rotas', label: 'Rotas', Icon: RouteIcon},
              {id: 'enderecos', label: 'Endereços', Icon: MapPin},
              {id: 'localizar', label: 'Localizar', Icon: Compass},
            ] as const
          ).map(({id, label, Icon}) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === 'rotas' && activeTab === 'rotas') {
                    setSelectedRouteId(null);
                  } else if (id !== 'rotas') {
                    setSelectedRouteId(null);
                  }
                  setActiveTab(id);
                }}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 transition-colors ${
                  isActive ? 'text-[#baff27]' : 'text-[#879389] hover:text-[#d5dcd4]'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} />
                <span className="text-[11px] font-semibold tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Team Drawer */}
      <MarmorariaModal
        isOpen={marmModalOpen}
        initialData={editingMarm}
        initialCoords={marmModalCoords}
        initialName={marmModalName}
        initialMapPickerOpen={marmModalMapOpen}
        shareNotice={shareNotice}
        userPosition={userPosition}
        onClose={() => {
          setMarmModalOpen(false);
          setShareNotice(null);
        }}
        onSave={(data) => void handleSaveMarmoraria(data)}
      />

      <WhatsAppModal
        isOpen={Boolean(whatsAppTarget)}
        targetName={whatsAppTarget?.name || ''}
        targetPhone={whatsAppTarget?.phone || ''}
        templates={templates}
        onClose={() => setWhatsAppTarget(null)}
        onSaveTemplates={(next) => void handleSaveTemplates(next)}
      />

      <CreateRouteModal
        isOpen={createRouteOpen}
        marmorarias={marmorarias}
        onClose={() => setCreateRouteOpen(false)}
        onCreate={(nome, ids) => void handleCreateRoute(nome, ids)}
      />

      <AddStopsModal
        isOpen={addStopsOpen}
        marmorarias={marmorarias}
        currentStops={activeRoute?.stops || []}
        onClose={() => setAddStopsOpen(false)}
        onApply={handleApplyRouteStops}
      />

      <TeamDrawer
        isOpen={teamDrawerOpen}
        session={session}
        teamUsers={teamUsers}
        localUserName={localUserName}
        marmorarias={marmorarias}
        routes={routes}
        templates={templates}
        onClose={() => setTeamDrawerOpen(false)}
        onChangeLocalUserName={setLocalUserName}
        onAuthSuccess={(newSession) => setSession(newSession)}
        onLogout={() => {
          setSession(null);
          setTeamUsers([]);
          setDriverLocations([]);
          setSelectedRouteId(null);
        }}
        onUsersUpdated={setTeamUsers}
      />
    </div>
  );
}
