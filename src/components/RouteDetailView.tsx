import {
  ArrowLeft,
  Check,
  Clock,
  Edit3,
  ExternalLink,
  GripVertical,
  Info,
  LocateFixed,
  Navigation,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {Reorder, useDragControls} from 'motion/react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {Coordinates, RoutePlan, RouteStop} from '../types.ts';
import {
  buildChunkedGoogleMapsRouteLinks,
  buildSingleStopGoogleMapsUrl,
  fetchRouteLegEstimates,
  formatDistancePt,
  formatDurationPt,
} from '../utils/geo.ts';
import type {RouteEstimatesResult} from '../utils/geo.ts';
import {AppMap} from './AppMap.tsx';

interface RouteDetailViewProps {
  route: RoutePlan;
  userPosition: Coordinates | null;
  geoError: string | null;
  onBack: () => void;
  onRequestGeo: () => void;
  onRenameRoute: (routeId: string, newName: string) => void;
  onDeleteRoute: (routeId: string) => void;
  onOpenAddStops: () => void;
  onSelectDestination: (routeId: string, stopId: string, forceSelect?: boolean) => void;
  onReorderPendingStops: (routeId: string, orderedStopIds: string[]) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue'
  ) => void;
  onOpenWhatsApp: (stop: RouteStop) => void;
}

interface IncomingLegInfo {
  isFromUser: boolean;
  legDurationSec: number;
  cumulativeDurationSec: number;
}

interface DraggableStopItemProps {
  stop: RouteStop;
  idx: number;
  pendingCount: number;
  isCurrent: boolean;
  isDragging: boolean;
  incomingLeg: IncomingLegInfo | null;
  routeId: string;
  userPosition: Coordinates | null;
  onSelectDestination: (routeId: string, stopId: string, forceSelect?: boolean) => void;
  onUpdateStopStatus: (
    routeId: string,
    stopId: string,
    status: 'pendente' | 'concluida' | 'nao_entregue'
  ) => void;
  onOpenWhatsApp: (stop: RouteStop) => void;
  onDragStart: (stopId: string) => void;
  onDragEnd: () => void;
}

function DraggableStopItem({
  stop,
  idx,
  pendingCount,
  isCurrent,
  isDragging,
  incomingLeg,
  routeId,
  userPosition,
  onSelectDestination,
  onUpdateStopStatus,
  onOpenWhatsApp,
  onDragStart,
  onDragEnd,
}: DraggableStopItemProps) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={stop}
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => onDragStart(stop.stopId)}
      onDragEnd={onDragEnd}
      className={`relative rounded-2xl border p-3.5 transition-colors ${
        isDragging
          ? 'z-20 border-[#baff27] bg-[#1c261d] shadow-2xl shadow-black/70'
          : isCurrent
          ? 'border-[#baff27]/60 bg-[#182118]'
          : 'border-[#242c25] bg-[#151a16]'
      }`}
    >
      {incomingLeg && (
        <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-[#101411] px-2.5 py-2 text-[11px] leading-snug tabular-nums">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#baff27]" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold text-[#baff27]">
              {incomingLeg.isFromUser ? 'Da sua posição' : 'Da parada anterior'}: ~
              {formatDurationPt(incomingLeg.legDurationSec)}
            </p>
            <p className="font-semibold text-[#ff873f]">
              Total acumulado: ~{formatDurationPt(incomingLeg.cumulativeDurationSec)}
            </p>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectDestination(routeId, stop.stopId)}
          className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums ${
              isCurrent ? 'bg-[#baff27] text-[#0d100e]' : 'bg-[#ff873f] text-[#0d100e]'
            }`}
          >
            {idx + 1}
          </span>
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-bold sm:text-base ${
                isCurrent ? 'text-[#baff27]' : 'text-[#f3f5f2]'
              }`}
            >
              {stop.nome}
            </p>
            <p className="mt-0.5 text-xs text-[#9aa59c]">
              {stop.cidade}
              {isCurrent && (
                <span className="font-semibold text-[#baff27]"> · Destino atual</span>
              )}
            </p>
          </div>
        </button>

        {/* Press-and-hold drag handle */}
        {pendingCount > 1 && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              dragControls.start(e);
            }}
            aria-label={`Segurar e arrastar ${stop.nome} para reordenar`}
            title="Segurar e arrastar para reordenar"
            className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-xl border transition-colors active:cursor-grabbing ${
              isDragging
                ? 'border-[#baff27] bg-[#baff27] text-[#0d100e]'
                : 'border-[#262f27] bg-[#101411] text-[#9aa59c] hover:border-[#3c4b3d] hover:text-[#f3f5f2]'
            }`}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Action buttons: Maps arrow, WhatsApp phone, Concluída (✓), Não entregue (X) */}
      <div className="mt-3 flex flex-nowrap items-center justify-between gap-1.5 border-t border-[#222a23] pt-3 sm:gap-2">
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
          <a
            href={buildSingleStopGoogleMapsUrl(stop, userPosition)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onSelectDestination(routeId, stop.stopId, true)}
            aria-label={`Abrir ${stop.nome} no Google Maps`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2 text-[11px] font-semibold text-[#e3e8e2] hover:border-[#ff873f]/50 hover:text-[#ff873f] sm:gap-1.5 sm:px-3 sm:text-xs"
          >
            <Navigation className="h-3.5 w-3.5 shrink-0 text-[#ff873f] sm:h-4 sm:w-4" />
            <span>Maps</span>
          </a>
          <button
            type="button"
            onClick={() => onOpenWhatsApp(stop)}
            aria-label={`WhatsApp para ${stop.nome}`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-[#283129] bg-[#101411] px-2 text-[11px] font-semibold text-[#e3e8e2] hover:border-[#baff27]/50 hover:text-[#baff27] sm:gap-1.5 sm:px-3 sm:text-xs"
          >
            <Phone className="h-3.5 w-3.5 shrink-0 text-[#baff27] sm:h-4 sm:w-4" />
            <span>WhatsApp</span>
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onUpdateStopStatus(routeId, stop.stopId, 'concluida')}
            aria-label={`Marcar ${stop.nome} como concluída`}
            title="Concluída"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-[#baff27]/15 px-2 text-[11px] font-bold text-[#baff27] hover:bg-[#baff27] hover:text-[#0d100e] sm:px-3 sm:text-xs"
          >
            <Check className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span>Concluída</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateStopStatus(routeId, stop.stopId, 'nao_entregue')}
            aria-label={`Marcar ${stop.nome} como não entregue`}
            title="Não entregue"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-[#ff873f]/15 px-2 text-[11px] font-bold text-[#ff873f] hover:bg-[#ff873f] hover:text-[#0d100e] sm:px-3 sm:text-xs"
          >
            <X className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Não entregue</span>
          </button>
        </div>
      </div>
    </Reorder.Item>
  );
}

export function RouteDetailView({
  route,
  userPosition,
  geoError,
  onBack,
  onRequestGeo,
  onRenameRoute,
  onDeleteRoute,
  onOpenAddStops,
  onSelectDestination,
  onReorderPendingStops,
  onUpdateStopStatus,
  onOpenWhatsApp,
}: RouteDetailViewProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(route.nome);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);

  const pendingStops = useMemo(
    () => route.stops.filter((s) => s.status === 'pendente'),
    [route.stops]
  );
  const [orderedPending, setOrderedPending] = useState<RouteStop[]>(pendingStops);
  const latestOrderRef = useRef<RouteStop[]>(pendingStops);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setOrderedPending(pendingStops);
      latestOrderRef.current = pendingStops;
    }
  }, [pendingStops]);

  const finishedStops = useMemo(
    () => route.stops.filter((s) => s.status !== 'pendente'),
    [route.stops]
  );

  const activeDest = pendingStops.find((s) => s.stopId === route.currentDestinationStopId) || null;

  const mapsSegments = useMemo(
    () => buildChunkedGoogleMapsRouteLinks(pendingStops, userPosition),
    [pendingStops, userPosition]
  );

  const [estimates, setEstimates] = useState<RouteEstimatesResult | null>(null);
  const [estimatesLoading, setEstimatesLoading] = useState(false);

  const pointsKey = useMemo(() => {
    const pts: string[] = [];
    if (userPosition) {
      pts.push(`${userPosition.lat.toFixed(4)},${userPosition.lng.toFixed(4)}`);
    }
    orderedPending.forEach((s) => {
      pts.push(`${s.lat.toFixed(5)},${s.lng.toFixed(5)}`);
    });
    return pts.join('|');
  }, [orderedPending, userPosition]);

  useEffect(() => {
    const points: Coordinates[] = [];
    if (userPosition) points.push(userPosition);
    orderedPending.forEach((s) => points.push({lat: s.lat, lng: s.lng}));

    if (points.length < 2) {
      setEstimates(null);
      setEstimatesLoading(false);
      return;
    }

    let cancelled = false;
    setEstimatesLoading(true);
    const timer = setTimeout(() => {
      void fetchRouteLegEstimates(points).then((result) => {
        if (!cancelled) {
          setEstimates(result);
          setEstimatesLoading(false);
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pointsKey, orderedPending, userPosition]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameRoute(route.id, trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#242c25] bg-[#151a16] p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-[#d5dcd4] hover:bg-[#1e251f]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Rotas</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftName(route.nome);
                setIsRenaming((prev) => !prev);
              }}
              aria-label="Renomear rota"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#d5dcd4] hover:border-[#baff27]/40 hover:text-[#baff27]"
            >
              <Edit3 className="h-4 w-4" />
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onDeleteRoute(route.id)}
                  className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-500"
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[44px] rounded-xl border border-[#283129] px-3 text-xs text-[#9aa59c]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Excluir rota"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#283129] bg-[#101411] text-[#9aa59c] hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isRenaming ? (
          <form onSubmit={handleSaveName} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="min-h-[44px] flex-1 rounded-xl border border-[#323d33] bg-[#0d100e] px-3.5 text-sm text-[#f3f5f2] focus:border-[#baff27] focus:outline-none"
              placeholder="Nome da rota"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-[#baff27] px-4 text-sm font-bold text-[#0d100e]"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="min-h-[44px] rounded-xl border border-[#283129] px-4 text-sm text-[#9aa59c]"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h1 className="text-xl font-bold text-[#f3f5f2] sm:text-2xl">{route.nome}</h1>
            <p className="mt-1 text-xs text-[#9aa59c] tabular-nums">
              <span>
                {pendingStops.length} {pendingStops.length === 1 ? 'pendente' : 'pendentes'}
              </span>
              {finishedStops.length > 0 && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {finishedStops.length}{' '}
                    {finishedStops.length === 1 ? 'finalizada' : 'finalizadas'}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Desktop 2-column split: Map left, Ordered stops right */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-16 lg:col-span-5">
          <AppMap
            mode="route"
            stops={route.stops}
            currentDestinationStopId={route.currentDestinationStopId}
            userPosition={userPosition}
            onSelectStop={(stopId) => onSelectDestination(route.id, stopId)}
            className="h-64 w-full sm:h-72 lg:h-80"
          />

          <p className="flex items-start gap-2 text-xs leading-relaxed text-[#9aa59c]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#ff873f]" />
            <span>O trânsito em tempo real é calculado ao abrir no Google Maps.</span>
          </p>

          {/* Geolocation, Time Estimate & Google Maps Route Buttons */}
          <div className="space-y-3 rounded-2xl border border-[#242c25] bg-[#151a16] p-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#9aa59c]">
                {userPosition
                  ? 'Ponto de partida: sua localização atual ativa'
                  : geoError || 'Localização atual ainda não obtida'}
              </span>
              {!userPosition && (
                <button
                  type="button"
                  onClick={onRequestGeo}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 font-semibold text-[#baff27] hover:underline"
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  <span>Usar minha posição</span>
                </button>
              )}
            </div>

            {orderedPending.length > 0 && (estimates || estimatesLoading) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#252e26] bg-[#101411] px-3 py-2 text-xs tabular-nums">
                <div className="flex items-center gap-1.5 text-[#d5dcd4]">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-[#baff27]" />
                  {estimates ? (
                    <span>
                      Tempo total:{' '}
                      <strong className="text-[#baff27]">
                        ~{formatDurationPt(estimates.totalDurationSec)}
                      </strong>{' '}
                      · {formatDistancePt(estimates.totalDistanceMeters)}
                    </span>
                  ) : (
                    <span className="text-[#9aa59c]">Calculando tempo dos trechos...</span>
                  )}
                </div>
                {estimates && (
                  <span className="text-[10px] font-medium text-[#7b877e]">
                    {estimates.source === 'osrm' ? 'Via OpenStreetMap' : 'Estimativa offline'}
                  </span>
                )}
              </div>
            )}

            {!userPosition && orderedPending.length === 1 && (
              <p className="text-[11px] text-[#7b877e]">
                Toque em Usar minha posição para estimar o tempo até a parada.
              </p>
            )}

            {mapsSegments.length === 0 ? (
              <p className="text-xs text-[#7b877e]">
                Adicione paradas pendentes para abrir a navegação no Google Maps.
              </p>
            ) : mapsSegments.length === 1 ? (
              <a
                href={mapsSegments[0].url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (!activeDest && pendingStops[0]) {
                    onSelectDestination(route.id, pendingStops[0].stopId, true);
                  }
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#baff27] px-4 py-3 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
              >
                <Navigation className="h-4 w-4" />
                <span>Abrir rota no Google Maps</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#ff873f]">
                  Rota dividida em partes para respeitar o limite de paradas do Google Maps no
                  celular:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {mapsSegments.map((seg) => (
                    <a
                      key={seg.partIndex}
                      href={seg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        const targetStop = pendingStops[seg.partIndex * 9] || pendingStops[0];
                        if (targetStop) {
                          onSelectDestination(route.id, targetStop.stopId, true);
                        }
                      }}
                      className="flex min-h-[46px] items-center justify-between rounded-xl bg-[#baff27] px-4 py-2.5 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
                    >
                      <span>{seg.label}</span>
                      <ExternalLink className="h-4 w-4 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ordered Stops List */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[#f3f5f2]">
              Paradas da rota ({pendingStops.length} pendentes)
            </h2>
            <button
              type="button"
              onClick={onOpenAddStops}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#baff27]/50 bg-[#baff27]/10 px-3.5 py-2 text-xs font-bold text-[#baff27] hover:bg-[#baff27]/20"
            >
              <Plus className="h-4 w-4" />
              <span className="whitespace-nowrap">Adicionar paradas</span>
            </button>
          </div>

          {route.stops.length === 0 ? (
            <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
              <p className="text-sm font-medium text-[#f3f5f2]">
                Esta rota ainda não possui paradas.
              </p>
              <p className="mt-1 text-xs text-[#9aa59c]">
                Toque em Adicionar paradas ou no botão + para selecionar marmorarias.
              </p>
            </div>
          ) : (
            <>
              {/* Pending stops */}
              {orderedPending.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs text-[#9aa59c]">
                    Toque no nome para marcar como destino atual. Segure e arraste o ícone à
                    direita para reordenar.
                  </p>
                  <Reorder.Group
                    axis="y"
                    values={orderedPending}
                    onReorder={(nextOrder) => {
                      latestOrderRef.current = nextOrder;
                      setOrderedPending(nextOrder);
                    }}
                    className="space-y-2.5"
                  >
                    {orderedPending.map((stop, idx) => {
                      let incomingLeg: IncomingLegInfo | null = null;
                      if (estimates) {
                        const legIndex = userPosition ? idx : idx - 1;
                        const leg = legIndex >= 0 ? estimates.legs[legIndex] : undefined;
                        if (leg) {
                          const cumulativeDurationSec = estimates.legs
                            .slice(0, legIndex + 1)
                            .reduce((sum, item) => sum + item.durationSec, 0);
                          incomingLeg = {
                            isFromUser: idx === 0 && Boolean(userPosition),
                            legDurationSec: leg.durationSec,
                            cumulativeDurationSec,
                          };
                        }
                      }

                      return (
                        <DraggableStopItem
                          key={stop.stopId}
                          stop={stop}
                          idx={idx}
                          pendingCount={orderedPending.length}
                          isCurrent={stop.stopId === route.currentDestinationStopId}
                          isDragging={draggingStopId === stop.stopId}
                          incomingLeg={incomingLeg}
                          routeId={route.id}
                          userPosition={userPosition}
                          onSelectDestination={onSelectDestination}
                          onUpdateStopStatus={onUpdateStopStatus}
                          onOpenWhatsApp={onOpenWhatsApp}
                          onDragStart={(id) => {
                            isDraggingRef.current = true;
                            setDraggingStopId(id);
                          }}
                          onDragEnd={() => {
                            isDraggingRef.current = false;
                            setDraggingStopId(null);
                            onReorderPendingStops(
                              route.id,
                              latestOrderRef.current.map((s) => s.stopId)
                            );
                          }}
                        />
                      );
                    })}
                  </Reorder.Group>
                </div>
              )}

              {/* Finished / History stops moved to bottom and dimmed */}
              {finishedStops.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h3 className="text-xs font-semibold tracking-wide text-[#7b877e]">
                    Histórico desta rota ({finishedStops.length})
                  </h3>
                  <ul className="space-y-2">
                    {finishedStops.map((stop) => {
                      const isDone = stop.status === 'concluida';
                      return (
                        <li
                          key={stop.stopId}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-[#202721] bg-[#121613] p-3.5 opacity-60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#d5dcd4] line-through">
                              {stop.nome}
                            </p>
                            <p className="mt-0.5 text-xs text-[#9aa59c]">
                              {stop.cidade}
                              <span aria-hidden="true"> · </span>
                              <span className={isDone ? 'text-[#baff27]' : 'text-[#ff873f]'}>
                                {isDone ? 'Concluída' : 'Não entregue'}
                              </span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenWhatsApp(stop)}
                              aria-label={`WhatsApp para ${stop.nome}`}
                              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#262f27] bg-[#0d100e] text-[#d5dcd4]"
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateStopStatus(route.id, stop.stopId, 'pendente')}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#2e382f] bg-[#181f19] px-3 text-xs font-semibold text-[#e3e8e2] hover:border-[#baff27]/40 hover:text-[#baff27]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Desfazer</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
