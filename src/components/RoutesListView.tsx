import {ChevronRight, Navigation, Plus, Route as RouteIcon} from 'lucide-react';
import type {RoutePlan} from '../types.ts';

interface RoutesListViewProps {
  routes: RoutePlan[];
  onOpenRoute: (routeId: string) => void;
  onCreateRoute: () => void;
}

export function RoutesListView({
  routes,
  onOpenRoute,
  onCreateRoute,
}: RoutesListViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#f3f5f2] sm:text-2xl">Rotas</h1>
          <p className="mt-0.5 text-xs text-[#9aa59c]">
            Toque em uma rota para ver o mapa, ordenar paradas e iniciar a navegação.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateRoute}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-[#baff27] px-4 py-2 text-sm font-bold text-[#0d100e] transition-transform active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span className="whitespace-nowrap">Nova rota</span>
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="rounded-2xl border border-[#242c25] bg-[#151a16] p-8 text-center">
          <RouteIcon className="mx-auto h-8 w-8 text-[#5d6b5f]" />
          <h2 className="mt-3 text-base font-semibold text-[#f3f5f2]">Nenhuma rota cadastrada</h2>
          <p className="mt-1 text-sm text-[#9aa59c]">
            Toque em Nova rota para começar.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#222a23] overflow-hidden rounded-2xl border border-[#242c25] bg-[#151a16]">
          {routes.map((route) => {
            const totalStops = route.stops.length;
            const currentDest = route.stops.find(
              (s) => s.stopId === route.currentDestinationStopId && s.status === 'pendente'
            );

            return (
              <li key={route.id}>
                <button
                  type="button"
                  onClick={() => onOpenRoute(route.id)}
                  className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#1b221c] active:bg-[#202821]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#f3f5f2] sm:text-base">
                      {route.nome} -{' '}
                      <span className="tabular-nums text-[#ff873f]">
                        {totalStops} {totalStops === 1 ? 'parada' : 'paradas'}
                      </span>
                    </p>
                    {currentDest && route.activeDriverName && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#ff873f]">
                        <Navigation className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {route.activeDriverName} em rota para {currentDest.nome}
                        </span>
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#6e7b70]" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
