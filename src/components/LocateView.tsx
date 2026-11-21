import {
  Clock,
  Crosshair,
  Info,
  Lock,
  MapPin,
  Radio,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {DriverLocation, RoutePlan, TeamSession, TeamUser} from '../types.ts';
import {formatRelativeTimePt} from '../utils/geo.ts';
import {AppMap} from './AppMap.tsx';

interface LocateViewProps {
  session: TeamSession | null;
  teamUsers: TeamUser[];
  routes?: RoutePlan[];
  driverLocations: DriverLocation[];
  isSharingOwnLocation: boolean;
  onRefreshLocations: () => void;
  onOpenTeamMenu: () => void;
}

interface DriverEntry {
  userId: string;
  name: string;
  login: string;
  location: DriverLocation | null;
  routeDestinationLabel: string | null;
}

export function LocateView({
  session,
  teamUsers,
  routes = [],
  driverLocations,
  isSharingOwnLocation,
  onRefreshLocations,
  onOpenTeamMenu,
}: LocateViewProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const driverEntries = useMemo<DriverEntry[]>(() => {
    const locationByUserId = new Map<string, DriverLocation>();
    driverLocations.forEach((loc) => locationByUserId.set(loc.userId, loc));

    const findRouteDestForDriver = (driverName: string, loc: DriverLocation | null) => {
      if (loc?.destinationName) {
        return `${driverName} em rota para ${loc.destinationName}`;
      }
      const activeRoute = routes.find(
        (r) =>
          r.status === 'em_andamento' &&
          r.activeDriverName?.toLowerCase() === driverName.toLowerCase() &&
          r.currentDestinationStopId
      );
      if (activeRoute) {
        const stop = activeRoute.stops.find(
          (s) => s.stopId === activeRoute.currentDestinationStopId && s.status === 'pendente'
        );
        if (stop) return `${driverName} em rota para ${stop.nome}`;
      }
      return null;
    };

    const registeredDrivers = teamUsers.filter((u) => u.role === 'motorista');
    const seenIds = new Set<string>();
    const list: DriverEntry[] = registeredDrivers.map((u) => {
      seenIds.add(u.id);
      const loc = locationByUserId.get(u.id) || null;
      return {
        userId: u.id,
        name: u.name,
        login: u.login,
        location: loc,
        routeDestinationLabel: findRouteDestForDriver(u.name, loc),
      };
    });

    driverLocations.forEach((loc) => {
      if (!seenIds.has(loc.userId)) {
        list.push({
          userId: loc.userId,
          name: loc.userName,
          login: '',
          location: loc,
          routeDestinationLabel: findRouteDestForDriver(loc.userName, loc),
        });
      }
    });

    return list;
  }, [teamUsers, driverLocations, routes]);

  const selectedEntry = useMemo(
    () => driverEntries.find((d) => d.userId === selectedDriverId) || null,
    [driverEntries, selectedDriverId]
  );

  // Clear selection if the selected driver is no longer in the team
  useEffect(() => {
    if (selectedDriverId && !driverEntries.some((d) => d.userId === selectedDriverId)) {
      setSelectedDriverId(null);
    }
  }, [selectedDriverId, driverEntries]);

  const handleSelectDriver = (driverId: string) => {
    setSelectedDriverId((prev) => (prev === driverId ? driverId : driverId));
    onRefreshLocations();
    if (window.innerWidth < 1024 && mapSectionRef.current) {
      setTimeout(() => {
        mapSectionRef.current?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }, 60);
    }
  };

  if (!session) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-6 w-6 shrink-0 text-[#ff873f]" />
            <div>
              <h1 className="text-lg font-bold text-[#f3f5f2] sm:text-xl">
                Localizar entregadores
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[#9aa59c]">
                No modo individual não há outros entregadores conectados. Ao ativar o{' '}
                <strong className="text-[#f3f5f2]">Modo Equipe</strong> como{' '}
                <strong className="text-[#f3f5f2]">Organizador</strong>, os entregadores cadastrados
                ficam listados aqui para você clicar e localizar cada um no mapa.
              </p>
              <button
                type="button"
                onClick={onOpenTeamMenu}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#baff27] px-4 py-2 text-sm font-bold text-[#0d100e]"
              >
                <UserPlus className="h-4 w-4" />
                <span>Configurar equipe e cadastrar entregadores</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (session.user.role !== 'organizador') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#ff873f]" />
            <div>
              <h1 className="text-lg font-bold text-[#f3f5f2]">
                Acesso exclusivo do organizador
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[#9aa59c]">
                Somente o organizador da equipe pode visualizar o mapa com a localização dos
                motoristas.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#f3f5f2]">
            <Radio
              className={`h-4 w-4 ${isSharingOwnLocation ? 'text-[#baff27]' : 'text-[#6e7b70]'}`}
            />
            <span>
              {isSharingOwnLocation
                ? 'Você está compartilhando sua localização com o organizador'
                : 'Compartilhamento aguardando uma rota em andamento'}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#9aa59c]">
            Sua posição é enviada apenas enquanto você estiver executando uma rota com o app aberto
            e a permissão de localização ativada. Navegadores de celular podem suspender o envio se
            o aplicativo for fechado ou a tela for bloqueada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f3f5f2] sm:text-2xl">
            Localizar entregadores
          </h1>
          <p className="mt-0.5 text-xs text-[#9aa59c]">
            Equipe {session.teamName} · Toque em um entregador para localizar
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTeamMenu}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#283129] bg-[#151a16] px-3 py-2 text-xs font-semibold text-[#e3e8e2] hover:border-[#baff27]/40 hover:text-[#baff27]"
          >
            <UserPlus className="h-4 w-4" />
            <span>Entregadores</span>
          </button>

          <button
            type="button"
            onClick={onRefreshLocations}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#283129] bg-[#151a16] px-3 py-2 text-xs font-semibold text-[#e3e8e2] hover:border-[#baff27]/40 hover:text-[#baff27]"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {driverEntries.length === 0 ? (
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-[#5d6b5f]" />
          <h2 className="mt-3 text-base font-semibold text-[#f3f5f2]">
            Nenhum entregador cadastrado na equipe
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[#9aa59c]">
            Cadastre até 2 entregadores no menu da equipe para acompanhar a lista e localizar cada
            um com um clique.
          </p>
          <button
            type="button"
            onClick={onOpenTeamMenu}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#baff27] px-4 py-2 text-xs font-bold text-[#0d100e]"
          >
            <UserPlus className="h-4 w-4" />
            <span>Cadastrar entregador</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          {/* Lista de entregadores cadastrados */}
          <div className="space-y-2.5 lg:col-span-5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#879389]">
                Entregadores cadastrados ({driverEntries.length})
              </h2>
              {selectedDriverId && driverLocations.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedDriverId(null)}
                  className="text-xs font-semibold text-[#baff27] hover:underline"
                >
                  Ver todos no mapa
                </button>
              )}
            </div>

            {driverEntries.map((driver) => {
              const loc = driver.location;
              const rel = loc ? formatRelativeTimePt(loc.updatedAt, nowMs) : null;
              const timeFormatted = loc
                ? new Date(loc.updatedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;
              const isLive = rel?.freshness === 'live';
              const isStale = rel?.freshness === 'stale';
              const isSelected = selectedDriverId === driver.userId;

              return (
                <button
                  key={driver.userId}
                  type="button"
                  onClick={() => handleSelectDriver(driver.userId)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-[#baff27] bg-[#1a221b]'
                      : 'border-[#242c25] bg-[#151a16] hover:border-[#374438]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          isLive
                            ? 'bg-[#baff27]'
                            : isStale
                            ? 'bg-[#ff873f]'
                            : loc
                            ? 'bg-[#7b877e]'
                            : 'bg-[#3b463d]'
                        }`}
                      />
                      <span className="truncate text-sm font-bold text-[#f3f5f2]">
                        {driver.name}
                      </span>
                      {driver.login && (
                        <span className="truncate text-xs text-[#7b877e]">@{driver.login}</span>
                      )}
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
                        isSelected
                          ? 'bg-[#baff27] text-[#0d100e]'
                          : 'bg-[#202821] text-[#baff27]'
                      }`}
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                      <span>{isSelected ? 'Localizando' : 'Localizar'}</span>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        isLive
                          ? 'text-[#baff27]'
                          : isStale
                          ? 'text-[#ff873f]'
                          : 'text-[#879389]'
                      }`}
                    >
                      {!loc
                        ? 'Sem localização enviada'
                        : isLive
                        ? 'Atualizado agora'
                        : isStale
                        ? 'Localização antiga'
                        : 'Sinal indisponível'}
                    </span>

                    {loc && rel && timeFormatted && (
                      <span className="inline-flex items-center gap-1 text-[#9aa59c] tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {timeFormatted} ({rel.label})
                        </span>
                      </span>
                    )}
                  </div>

                  {driver.routeDestinationLabel ? (
                    <p className="mt-1.5 text-xs font-semibold text-[#ff873f]">
                      {driver.routeDestinationLabel}
                      {loc?.routeName && (
                        <span className="font-normal text-[#9aa59c]"> · {loc.routeName}</span>
                      )}
                    </p>
                  ) : loc?.routeName ? (
                    <p className="mt-1.5 text-xs text-[#d5dcd4]">
                      Rota: <span className="font-medium">{loc.routeName}</span>
                    </p>
                  ) : !loc ? (
                    <p className="mt-1.5 text-xs text-[#7b877e]">
                      Aguardando o entregador abrir uma rota em andamento com GPS ativo.
                    </p>
                  ) : null}
                </button>
              );
            })}

            <p className="flex items-start gap-2 pt-1 text-xs leading-relaxed text-[#7b877e]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Posições com mais de 2 minutos são sinalizadas como antigas. Navegadores móveis
                podem pausar o envio quando a tela é bloqueada ou o app é fechado.
              </span>
            </p>
          </div>

          {/* Mapa com foco no entregador selecionado */}
          <div ref={mapSectionRef} className="space-y-2.5 lg:col-span-7">
            {selectedEntry && !selectedEntry.location && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-[#ff873f]/40 bg-[#1f1915] p-3.5 text-xs text-[#f3f5f2]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ff873f]" />
                <span>
                  <strong>{selectedEntry.name}</strong> ainda não enviou localização. Assim que
                  abrir uma rota em andamento no celular com GPS ativo, o ponto aparecerá aqui.
                </span>
              </div>
            )}

            {selectedEntry && selectedEntry.location && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#baff27]/35 bg-[#161e17] px-3.5 py-2 text-xs">
                <span className="font-semibold text-[#f3f5f2]">
                  Localizando <strong className="text-[#baff27]">{selectedEntry.name}</strong>
                </span>
                {driverLocations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDriverId(null)}
                    className="font-bold text-[#baff27] hover:underline"
                  >
                    Ver todos
                  </button>
                )}
              </div>
            )}

            {driverLocations.length === 0 ? (
              <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
                <Radio className="mx-auto h-8 w-8 text-[#5d6b5f]" />
                <h3 className="mt-3 text-base font-semibold text-[#f3f5f2]">
                  Ninguém está compartilhando a localização no momento
                </h3>
                <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[#9aa59c]">
                  Toque em qualquer entregador da lista para consultar a última posição assim que
                  ele iniciar uma rota no celular.
                </p>
              </div>
            ) : (
              <AppMap
                mode="drivers"
                driverLocations={driverLocations}
                focusedDriverId={selectedDriverId}
                onSelectDriver={(uid) => setSelectedDriverId(uid)}
                className="h-72 w-full sm:h-80 lg:h-[440px]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
