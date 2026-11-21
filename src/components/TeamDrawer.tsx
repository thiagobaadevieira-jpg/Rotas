import {
  Check,
  Copy,
  Download,
  HelpCircle,
  LogOut,
  Plus,
  Share2,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall.ts';
import type {Marmoraria, RoutePlan, TeamSession, TeamUser, WhatsAppTemplate} from '../types.ts';

interface TeamDrawerProps {
  isOpen: boolean;
  session: TeamSession | null;
  teamUsers: TeamUser[];
  localUserName: string;
  marmorarias: Marmoraria[];
  routes: RoutePlan[];
  templates: WhatsAppTemplate[];
  onClose: () => void;
  onChangeLocalUserName: (name: string) => void;
  onAuthSuccess: (session: TeamSession) => void;
  onLogout: () => void;
  onUsersUpdated: (users: TeamUser[]) => void;
}

export function TeamDrawer({
  isOpen,
  session,
  teamUsers,
  localUserName,
  marmorarias,
  routes,
  templates,
  onClose,
  onChangeLocalUserName,
  onAuthSuccess,
  onLogout,
  onUsersUpdated,
}: TeamDrawerProps) {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const [authTab, setAuthTab] = useState<'create' | 'login'>('create');
  const [teamName, setTeamName] = useState('');
  const [organizerName, setOrganizerName] = useState(localUserName || '');
  const [teamCode, setTeamCode] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [carryLocalData, setCarryLocalData] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Add driver state (Organizer only)
  const [driverName, setDriverName] = useState('');
  const [driverLogin, setDriverLogin] = useState('');
  const [driverPass, setDriverPass] = useState('');
  const [driverError, setDriverError] = useState<string | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);

  const [copiedCode, setCopiedCode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  if (!isOpen) return null;

  const drivers = teamUsers.filter((u) => u.role === 'motorista');

  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/team/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          teamName,
          organizerName,
          login,
          password,
          marmorarias: carryLocalData ? marmorarias : [],
          routes: carryLocalData ? routes : [],
          templates: carryLocalData ? templates : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Erro ao criar equipe.');
        return;
      }
      onAuthSuccess(data as TeamSession);
      setPassword('');
    } catch {
      setAuthError('Não foi possível conectar ao servidor da equipe.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/team/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({teamCode, login, password}),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Credenciais inválidas.');
        return;
      }
      onAuthSuccess(data as TeamSession);
      setPassword('');
    } catch {
      setAuthError('Não foi possível conectar ao servidor da equipe.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setDriverError(null);
    setDriverLoading(true);
    try {
      const res = await fetch('/api/team/drivers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({name: driverName, login: driverLogin, password: driverPass}),
      });
      const data = await res.json();
      if (!res.ok) {
        setDriverError(data.error || 'Não foi possível cadastrar motorista.');
        return;
      }
      onUsersUpdated(data.users as TeamUser[]);
      setDriverName('');
      setDriverLogin('');
      setDriverPass('');
    } catch {
      setDriverError('Erro ao conectar com o servidor.');
    } finally {
      setDriverLoading(false);
    }
  };

  const handleRemoveDriver = async (driverId: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/team/drivers/${driverId}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${session.token}`},
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.users)) {
        onUsersUpdated(data.users as TeamUser[]);
      }
    } catch {
      // Ignore network hiccup
    }
  };

  const handleCopyCode = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.teamCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-md flex-col border-l border-[#283129] bg-[#121613] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#222a23] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-[#baff27]" />
            <h2 className="text-base font-bold text-[#f3f5f2]">Equipe e Opções</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#ff873f] hover:bg-[#ff873f]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* PWA Install Section */}
          {!isInstalled && (isInstallable || isIOS) && (
            <section className="rounded-2xl border border-[#baff27]/35 bg-[#172017] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#f3f5f2]">Instalar no aparelho</h3>
                  <p className="mt-0.5 text-xs text-[#9aa59c]">
                    Use como aplicativo e receba locais do Google Maps pelo Compartilhar.
                  </p>
                </div>
                {isInstallable ? (
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-[#baff27] px-3.5 text-xs font-bold text-[#0d100e]"
                  >
                    <Download className="h-4 w-4" />
                    <span>Instalar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide((p) => !p)}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-[#baff27]/50 px-3 text-xs font-bold text-[#baff27]"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>iPhone / iPad</span>
                  </button>
                )}
              </div>
              {showIOSGuide && (
                <p className="mt-3 border-t border-[#2a382b] pt-2.5 text-xs leading-relaxed text-[#d5dcd4]">
                  No Safari: toque em <strong>Compartilhar</strong> e escolha{' '}
                  <strong>Adicionar à Tela de Início</strong>.
                </p>
              )}
            </section>
          )}

          {/* Authenticated Team View OR Login/Create */}
          {session ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[#242c25] bg-[#161c17] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#baff27]">
                      {session.user.role === 'organizador' ? 'Organizador' : 'Motorista'}
                    </p>
                    <h3 className="mt-0.5 text-base font-bold text-[#f3f5f2]">
                      {session.teamName}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#9aa59c]">
                      Conectado como <strong className="text-[#e3e8e2]">{session.user.name}</strong>{' '}
                      ({session.user.login})
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#2c372d] bg-[#0d100e] px-3 font-mono text-xs font-bold text-[#baff27]"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{session.teamCode}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[#2b342c] bg-[#0d100e] text-xs font-semibold text-[#d5dcd4] hover:border-red-500/40 hover:text-red-300"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair da equipe (voltar ao modo individual)</span>
                </button>
              </div>

              {/* Team Members */}
              <div className="rounded-2xl border border-[#242c25] bg-[#161c17] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#f3f5f2]">Membros da equipe</h4>
                  <span className="text-xs text-[#9aa59c] tabular-nums">
                    {drivers.length}/2 motoristas
                  </span>
                </div>

                <ul className="mt-3 divide-y divide-[#222a23]">
                  {teamUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-[#f3f5f2]">{u.name}</p>
                        <p className="text-xs text-[#9aa59c]">
                          {u.role === 'organizador' ? 'Organizador' : 'Motorista'} · {u.login}
                        </p>
                      </div>
                      {session.user.role === 'organizador' && u.role === 'motorista' && (
                        <button
                          type="button"
                          onClick={() => void handleRemoveDriver(u.id)}
                          aria-label={`Remover ${u.name}`}
                          className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[#9aa59c] hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {session.user.role === 'organizador' && drivers.length < 2 && (
                  <form
                    onSubmit={handleAddDriver}
                    className="mt-4 space-y-2.5 border-t border-[#222a23] pt-4"
                  >
                    <p className="text-xs font-semibold text-[#baff27]">
                      Adicionar motorista ({2 - drivers.length} vaga{drivers.length === 1 ? '' : 's'})
                    </p>
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Nome do motorista (ex.: Thiago)"
                      className="min-h-[42px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3 text-xs text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={driverLogin}
                        onChange={(e) => setDriverLogin(e.target.value)}
                        placeholder="Login"
                        className="min-h-[42px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3 text-xs text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                        required
                      />
                      <input
                        type="password"
                        value={driverPass}
                        onChange={(e) => setDriverPass(e.target.value)}
                        placeholder="Senha (mín. 6)"
                        className="min-h-[42px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3 text-xs text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                        required
                      />
                    </div>
                    {driverError && <p className="text-xs text-red-400">{driverError}</p>}
                    <button
                      type="submit"
                      disabled={driverLoading}
                      className="inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#baff27] text-xs font-bold text-[#0d100e] disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Cadastrar motorista</span>
                    </button>
                  </form>
                )}
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              {/* Individual Mode Name */}
              <div className="rounded-2xl border border-[#242c25] bg-[#161c17] p-4">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#d5dcd4]">
                  <UserCheck className="h-4 w-4 text-[#baff27]" />
                  <span>Seu nome no modo individual</span>
                </label>
                <input
                  type="text"
                  value={localUserName}
                  onChange={(e) => onChangeLocalUserName(e.target.value)}
                  placeholder="Ex.: Thiago"
                  className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-[#7b877e]">
                  Aparece no destino atual das rotas (ex.: &ldquo;Thiago em rota para Marmoraria
                  Central&rdquo;).
                </p>
              </div>

              {/* Team Auth Tabs */}
              <div className="rounded-2xl border border-[#242c25] bg-[#161c17] p-4">
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#0d100e] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('create');
                      setAuthError(null);
                    }}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                      authTab === 'create'
                        ? 'bg-[#baff27] text-[#0d100e]'
                        : 'text-[#9aa59c] hover:text-[#f3f5f2]'
                    }`}
                  >
                    Criar equipe
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('login');
                      setAuthError(null);
                    }}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                      authTab === 'login'
                        ? 'bg-[#baff27] text-[#0d100e]'
                        : 'text-[#9aa59c] hover:text-[#f3f5f2]'
                    }`}
                  >
                    Entrar na equipe
                  </button>
                </div>

                {authTab === 'create' ? (
                  <form onSubmit={handleRegisterTeam} className="mt-4 space-y-3">
                    <p className="text-xs text-[#9aa59c]">
                      Crie sua conta de <strong>Organizador</strong> para sincronizar rotas e
                      acompanhar até 2 motoristas.
                    </p>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="Nome da equipe / empresa"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      value={organizerName}
                      onChange={(e) => setOrganizerName(e.target.value)}
                      placeholder="Seu nome"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="Login (ex.: thiago ou email)"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Senha (mínimo 6 caracteres)"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />

                    <label className="flex cursor-pointer items-center gap-2.5 text-xs text-[#d5dcd4]">
                      <input
                        type="checkbox"
                        checked={carryLocalData}
                        onChange={(e) => setCarryLocalData(e.target.checked)}
                        className="h-4 w-4 accent-[#baff27]"
                      />
                      <span>Levar minhas marmorarias e rotas atuais para a equipe</span>
                    </label>

                    {authError && <p className="text-xs text-red-400">{authError}</p>}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="min-h-[46px] w-full rounded-xl bg-[#baff27] text-sm font-bold text-[#0d100e] disabled:opacity-50"
                    >
                      {authLoading ? 'Criando...' : 'Criar equipe e entrar'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLoginTeam} className="mt-4 space-y-3">
                    <p className="text-xs text-[#9aa59c]">
                      Entre como <strong>Organizador</strong> ou <strong>Motorista</strong> usando
                      o código da equipe.
                    </p>
                    <input
                      type="text"
                      value={teamCode}
                      onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                      placeholder="Código da equipe (ex.: RV-4K8M)"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 font-mono text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="Seu login"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sua senha"
                      className="min-h-[44px] w-full rounded-xl border border-[#29332a] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
                      required
                    />

                    {authError && <p className="text-xs text-red-400">{authError}</p>}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="min-h-[46px] w-full rounded-xl bg-[#baff27] text-sm font-bold text-[#0d100e] disabled:opacity-50"
                    >
                      {authLoading ? 'Entrando...' : 'Entrar na equipe'}
                    </button>
                  </form>
                )}
              </div>
            </section>
          )}

          {/* Clear separation of Offline/Local vs Backend + Instructions */}
          <section className="rounded-2xl border border-[#242c25] bg-[#161c17] p-4">
            <button
              type="button"
              onClick={() => setShowGuide((prev) => !prev)}
              className="flex min-h-[36px] w-full items-center justify-between text-left text-xs font-bold text-[#e3e8e2]"
            >
              <span className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-[#ff873f]" />
                <span>O que funciona sem backend vs. com equipe</span>
              </span>
              <span className="text-[#9aa59c]">{showGuide ? 'Ocultar' : 'Ver detalhes'}</span>
            </button>

            {showGuide && (
              <div className="mt-3 space-y-3 border-t border-[#222a23] pt-3 text-xs leading-relaxed text-[#9aa59c]">
                <div>
                  <p className="font-semibold text-[#baff27]">Funciona sem backend (Modo Individual):</p>
                  <p className="mt-1">
                    Cadastro e busca de marmorarias (incluindo os 6 dados de teste), criação e
                    reordenação de rotas, marcação de concluída/não entregue, mapa interno
                    OpenStreetMap, links do Google Maps em partes e mensagens do WhatsApp ficam
                    salvos no navegador.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[#ff873f]">
                    Requer equipe configurada no backend:
                  </p>
                  <p className="mt-1">
                    Login separado para organizador e até 2 motoristas, sincronização em tempo real
                    entre aparelhos, registro do criador da rota, acompanhamento na aba Localizar
                    (exclusivo do organizador) e leitura automática de links curtos{' '}
                    <span className="font-mono">maps.app.goo.gl</span>.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-[#f3f5f2]">Compartilhar do Google Maps (PWA):</p>
                  <p className="mt-1">
                    Ao instalar o app no Android/Chrome, o Rota Verde aparece no menu Compartilhar
                    do Google Maps e abre o cadastro com as coordenadas preenchidas.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
