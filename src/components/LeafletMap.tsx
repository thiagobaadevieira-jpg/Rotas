import L from 'leaflet';
import {useEffect, useRef} from 'react';
import type {Coordinates, DriverLocation, RouteStop} from '../types.ts';
import {formatRelativeTimePt} from '../utils/geo.ts';

export interface AppMapProps {
  mode: 'route' | 'pick' | 'drivers';
  stops?: RouteStop[];
  currentDestinationStopId?: string | null;
  userPosition?: Coordinates | null;
  pickedPosition?: Coordinates | null;
  driverLocations?: DriverLocation[];
  focusedDriverId?: string | null;
  onPickCoordinates?: (coords: Coordinates) => void;
  onSelectStop?: (stopId: string) => void;
  onSelectDriver?: (userId: string) => void;
  className?: string;
}

// Default center: Northern Santa Catarina (Joinville / Jaraguá do Sul / Blumenau / São Bento do Sul)
const DEFAULT_CENTER: [number, number] = [-26.48, -49.02];
const DEFAULT_ZOOM = 10;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function LeafletMap({
  mode,
  stops = [],
  currentDestinationStopId = null,
  userPosition = null,
  pickedPosition = null,
  driverLocations = [],
  focusedDriverId = null,
  onPickCoordinates,
  onSelectStop,
  onSelectDriver,
  className = 'h-64 w-full',
}: AppMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const hasFittedRef = useRef<string>('');
  const onPickRef = useRef(onPickCoordinates);
  const onSelectStopRef = useRef(onSelectStop);
  const onSelectDriverRef = useRef(onSelectDriver);

  onPickRef.current = onPickCoordinates;
  onSelectStopRef.current = onSelectStop;
  onSelectDriverRef.current = onSelectDriver;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (mode === 'pick' && onPickRef.current) {
        onPickRef.current({
          lat: Number(e.latlng.lat.toFixed(6)),
          lng: Number(e.latlng.lng.toFixed(6)),
        });
      }
    };

    map.on('click', handleClick);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(el);

    setTimeout(() => map.invalidateSize(), 120);

    return () => {
      resizeObserver.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      hasFittedRef.current = '';
    };
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    if (mode === 'route') {
      const pendingStops = stops.filter((s) => s.status === 'pendente');

      if (userPosition) {
        boundsPoints.push([userPosition.lat, userPosition.lng]);
        const userIcon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div style="transform: translate(-50%, -50%); display:flex; flex-direction:column; align-items:center;">
              <div style="background:rgba(13,16,14,0.92); color:#baff27; border:1px solid rgba(186,255,39,0.6); border-radius:6px; padding:1px 6px; font-size:10px; font-weight:700; white-space:nowrap; margin-bottom:4px;">Sua posição</div>
              <div style="width:14px; height:14px; border-radius:9999px; background:#baff27; border:3px solid #0d100e; box-shadow:0 0 0 4px rgba(186,255,39,0.3);"></div>
            </div>
          `,
        });
        L.marker([userPosition.lat, userPosition.lng], {icon: userIcon, zIndexOffset: 500}).addTo(
          group
        );
      }

      // Subtle dashed visual line connecting user position -> pending stops
      if (pendingStops.length > 0) {
        const lineCoords: [number, number][] = [];
        if (userPosition) lineCoords.push([userPosition.lat, userPosition.lng]);
        pendingStops.forEach((s) => lineCoords.push([s.lat, s.lng]));
        if (lineCoords.length >= 2) {
          L.polyline(lineCoords, {
            color: '#ff873f',
            weight: 2.5,
            opacity: 0.72,
            dashArray: '6, 6',
          }).addTo(group);
        }
      }

      let pendingIdx = 0;
      stops.forEach((stop) => {
        const isPending = stop.status === 'pendente';
        const isActive = stop.stopId === currentDestinationStopId && isPending;
        if (isPending) pendingIdx += 1;
        const labelNum = isPending ? String(pendingIdx) : stop.status === 'concluida' ? '✓' : '✕';

        boundsPoints.push([stop.lat, stop.lng]);

        const labelCls = isActive
          ? 'rota-stop-label rota-stop-label--active'
          : isPending
          ? 'rota-stop-label'
          : 'rota-stop-label rota-stop-label--done';

        const dotCls = isActive
          ? 'rota-stop-dot rota-stop-dot--active'
          : isPending
          ? 'rota-stop-dot'
          : 'rota-stop-dot rota-stop-dot--done';

        const markerIcon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div class="rota-stop-pin">
              <div class="${labelCls}">${escapeHtml(labelNum)} · ${escapeHtml(stop.nome)}</div>
              <div class="${dotCls}">${escapeHtml(labelNum)}</div>
            </div>
          `,
        });

        const marker = L.marker([stop.lat, stop.lng], {
          icon: markerIcon,
          zIndexOffset: isActive ? 450 : isPending ? 300 : 100,
        }).addTo(group);

        marker.on('click', () => {
          if (onSelectStopRef.current && isPending) {
            onSelectStopRef.current(stop.stopId);
          }
        });
      });

      const fitKey = `route:${stops.map((s) => `${s.stopId}:${s.lat}:${s.lng}`).join(',')}`;
      if (boundsPoints.length > 0 && hasFittedRef.current !== fitKey) {
        hasFittedRef.current = fitKey;
        if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], 14);
        } else {
          map.fitBounds(L.latLngBounds(boundsPoints), {padding: [42, 42], maxZoom: 15});
        }
      }
    } else if (mode === 'pick') {
      if (pickedPosition) {
        const pinIcon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div class="rota-stop-pin">
              <div class="rota-stop-label rota-stop-label--active">Ponto marcado</div>
              <div class="rota-stop-dot" style="background:#baff27; color:#0d100e;">●</div>
            </div>
          `,
        });
        L.marker([pickedPosition.lat, pickedPosition.lng], {icon: pinIcon}).addTo(group);
        const fitKey = `pick:${pickedPosition.lat.toFixed(4)},${pickedPosition.lng.toFixed(4)}`;
        if (hasFittedRef.current === '') {
          hasFittedRef.current = fitKey;
          map.setView([pickedPosition.lat, pickedPosition.lng], 15);
        }
      } else if (userPosition && hasFittedRef.current === '') {
        hasFittedRef.current = 'pick:user';
        map.setView([userPosition.lat, userPosition.lng], 13);
      }
    } else if (mode === 'drivers') {
      const now = Date.now();
      driverLocations.forEach((loc) => {
        const rel = formatRelativeTimePt(loc.updatedAt, now);
        const isLive = rel.freshness === 'live';
        const isStale = rel.freshness === 'stale';
        const isFocused = loc.userId === focusedDriverId;
        const color = isLive ? '#baff27' : isStale ? '#ff873f' : '#7b877e';
        const statusText = isLive
          ? rel.label
          : isStale
          ? `Antiga (${rel.label})`
          : `Indisponível (${rel.label})`;

        boundsPoints.push([loc.lat, loc.lng]);

        const icon = L.divIcon({
          className: 'rota-stop-pin-wrapper',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `
            <div class="rota-stop-pin">
              <div class="rota-stop-label" style="border-color:${isFocused ? '#baff27' : color}; color:${isFocused || isLive ? '#baff27' : '#f3f5f2'};">
                ${escapeHtml(loc.userName)} · ${escapeHtml(statusText)}
              </div>
              <div class="rota-stop-dot" style="background:${color}; color:#0d100e; width:26px; height:26px; ${isFocused ? 'box-shadow:0 0 0 4px rgba(186,255,39,0.4);' : ''}">
                ${escapeHtml(loc.userName.charAt(0).toUpperCase())}
              </div>
            </div>
          `,
        });

        const marker = L.marker([loc.lat, loc.lng], {
          icon,
          zIndexOffset: isFocused ? 500 : isLive ? 400 : 200,
        }).addTo(group);

        marker.on('click', () => {
          onSelectDriverRef.current?.(loc.userId);
        });
      });

      const focused = focusedDriverId
        ? driverLocations.find((d) => d.userId === focusedDriverId)
        : null;
      const fitKey = focused
        ? `drivers:focus:${focused.userId}:${focused.lat}:${focused.lng}`
        : `drivers:${driverLocations.map((d) => `${d.userId}:${d.lat}:${d.lng}`).join(',')}`;

      if (focused && hasFittedRef.current !== fitKey) {
        hasFittedRef.current = fitKey;
        map.setView([focused.lat, focused.lng], 15);
      } else if (boundsPoints.length > 0 && hasFittedRef.current !== fitKey) {
        hasFittedRef.current = fitKey;
        if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], 14);
        } else {
          map.fitBounds(L.latLngBounds(boundsPoints), {padding: [45, 45], maxZoom: 15});
        }
      }
    }
  }, [
    mode,
    stops,
    currentDestinationStopId,
    userPosition,
    pickedPosition,
    driverLocations,
    focusedDriverId,
  ]);

  return (
    <div
      ref={containerRef}
      className={`rota-leaflet-container relative z-0 overflow-hidden rounded-2xl border border-[#242c25] bg-[#141915] ${className}`}
    />
  );
}
