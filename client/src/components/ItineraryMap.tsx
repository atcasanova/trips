import React, { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { Loader2, MapPinned, RefreshCw, Hotel, Plane } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export type MapPointType = 'ACTIVITY' | 'HOTEL' | 'AIRPORT';

export interface ItineraryMapPoint {
  itemId: string;
  number?: number;
  title: string;
  subtitle?: string;
  dayLabel?: string;
  latitude: number;
  longitude: number;
  pointType?: MapPointType;
  airportCode?: string;
}

interface ItineraryMapProps {
  points: ItineraryMapPoint[];
  onPointSelect: (itemId: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  canRefresh?: boolean;
  accentColor?: string;
  refreshMessage?: string | null;
  refreshError?: string | null;
}

const initialView: L.LatLngExpression = [20, 0];

const createMarkerIcon = (point: ItineraryMapPoint, accentColor: string) => {
  if (point.pointType === 'HOTEL') {
    return L.divIcon({
      className: 'itinerary-map-marker-wrapper',
      html: `
        <span class="itinerary-map-marker itinerary-marker-hotel" aria-label="Hotel: ${point.title}" title="Hotel: ${point.title}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M6 14h12"/>
            <path d="M6 18v2"/>
            <path d="M18 18v2"/>
            <path d="M2 11h20"/>
          </svg>
        </span>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  if (point.pointType === 'AIRPORT') {
    return L.divIcon({
      className: 'itinerary-map-marker-wrapper',
      html: `
        <span class="itinerary-map-marker itinerary-marker-airport" aria-label="Aeroporto: ${point.title}" title="Aeroporto: ${point.title}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
          </svg>
        </span>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  // Standard activity marker with sequential number
  const num = point.number || 1;
  return L.divIcon({
    className: 'itinerary-map-marker-wrapper',
    html: `<span class="itinerary-map-marker" style="background-color: ${accentColor}" aria-label="Parada ${num}">${num}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

export const ItineraryMap: React.FC<ItineraryMapProps> = ({
  points,
  onPointSelect,
  onRefresh,
  isRefreshing = false,
  canRefresh = false,
  accentColor = '#b94a5d',
  refreshMessage = null,
  refreshError = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: initialView,
      zoom: 2,
      scrollWheelZoom: true,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  const prevCoordsKeyRef = useRef<string>('');

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();

    if (points.length === 0) {
      if (prevCoordsKeyRef.current !== '') {
        prevCoordsKeyRef.current = '';
        map.setView(initialView, 2, { animate: false });
        requestAnimationFrame(() => map.invalidateSize());
      }
      return;
    }

    const currentCoordsKey = points
      .map((p) => `${p.pointType || 'ACT'}:${p.number || 0}:${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`)
      .join(';');

    for (const point of points) {
      const tooltipContent = document.createElement('span');
      if (point.pointType === 'HOTEL') {
        tooltipContent.textContent = `🏨 ${point.title}${point.dayLabel ? ` • ${point.dayLabel}` : ''}`;
      } else if (point.pointType === 'AIRPORT') {
        tooltipContent.textContent = `✈️ ${point.title}${point.dayLabel ? ` • ${point.dayLabel}` : ''}`;
      } else {
        tooltipContent.textContent = `${point.number}. ${point.title} — ${point.dayLabel}`;
      }

      const marker = L.marker([point.latitude, point.longitude], {
        icon: createMarkerIcon(point, accentColor),
      })
        .bindTooltip(tooltipContent, { direction: 'top', offset: [0, -16] })
        .on('click', () => onPointSelect(point.itemId));
      marker.addTo(markerLayer);
    }

    // Only refit bounds if coordinates/points structure actually changed
    if (prevCoordsKeyRef.current !== currentCoordsKey) {
      prevCoordsKeyRef.current = currentCoordsKey;
      const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as L.LatLngTuple));
      if (points.length === 1) {
        map.setView(bounds.getCenter(), 14, { animate: false });
      } else {
        map.fitBounds(bounds.pad(0.18), { maxZoom: 14, animate: false });
      }
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [points, onPointSelect, accentColor]);

  const activityCount = points.filter((p) => p.pointType === 'ACTIVITY' || !p.pointType).length;
  const hotelCount = points.filter((p) => p.pointType === 'HOTEL').length;
  const airportCount = points.filter((p) => p.pointType === 'AIRPORT').length;

  return (
    <section id="itinerary-map-card" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative z-0 isolate" aria-label="Mapa do roteiro">
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: accentColor }}
          >
            <MapPinned className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">Mapa do Roteiro</h3>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                {activityCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-slate-700 font-semibold">
                    {activityCount} {activityCount === 1 ? 'parada' : 'paradas'}
                  </span>
                )}
                {hotelCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded-full font-semibold">
                    <Hotel className="w-3 h-3 text-emerald-600" />
                    {hotelCount} {hotelCount === 1 ? 'hotel' : 'hotéis'}
                  </span>
                )}
                {airportCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-200/80 px-2 py-0.5 rounded-full font-semibold">
                    <Plane className="w-3 h-3 text-sky-600" />
                    {airportCount} {airportCount === 1 ? 'aeroporto' : 'aeroportos'}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {points.length > 0
                ? 'Clique em qualquer parada para navegar até os detalhes no roteiro.'
                : 'As paradas com localização verificada aparecerão aqui.'}
            </p>
            {refreshMessage && <p className="mt-1 text-xs font-medium text-sky-700" role="status">{refreshMessage}</p>}
            {refreshError && <p className="mt-1 text-xs font-medium text-amber-700" role="alert">{refreshError}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:self-auto">
          {canRefresh && onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              title="Pesquisar novamente as localizações do roteiro e hotéis"
            >
              {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isRefreshing ? 'Localizando...' : 'Atualizar pontos'}
            </button>
          )}
        </div>
      </div>

      <div className="relative h-[320px] sm:h-[400px]">
        <div ref={containerRef} className="h-full w-full" />

        {/* Legend strip overlay at bottom left */}
        {points.length > 0 && (
          <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200 shadow-md rounded-xl px-2.5 py-1.5 flex items-center gap-2.5 text-[11px] text-slate-700 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: accentColor }}>1</span>
              <span>Paradas</span>
            </span>
            {hotelCount > 0 && (
              <span className="flex items-center gap-1 text-emerald-800">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <Hotel className="w-2.5 h-2.5" />
                </span>
                <span>Hotéis</span>
              </span>
            )}
            {airportCount > 0 && (
              <span className="flex items-center gap-1 text-sky-800">
                <span className="w-3.5 h-3.5 rounded-full bg-sky-600 text-white flex items-center justify-center">
                  <Plane className="w-2.5 h-2.5" />
                </span>
                <span>Aeroportos</span>
              </span>
            )}
          </div>
        )}

        {points.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <p className="max-w-sm rounded-xl bg-white/95 px-4 py-3 text-center text-xs leading-relaxed text-slate-600 shadow-sm ring-1 ring-slate-200">
              Nenhum ponto verificável foi encontrado ainda. Atualize os pontos após informar a cidade e as atrações do roteiro.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
