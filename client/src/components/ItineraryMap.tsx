import React, { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { Loader2, MapPinned, RefreshCw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export interface ItineraryMapPoint {
  itemId: string;
  number: number;
  title: string;
  dayLabel: string;
  latitude: number;
  longitude: number;
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

const markerIcon = (number: number) =>
  L.divIcon({
    className: 'itinerary-map-marker-wrapper',
    html: `<span class="itinerary-map-marker" aria-label="Parada ${number}">${number}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

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

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();

    if (points.length === 0) {
      map.setView(initialView, 2, { animate: false });
      requestAnimationFrame(() => map.invalidateSize());
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as L.LatLngTuple));

    for (const point of points) {
      const tooltipContent = document.createElement('span');
      tooltipContent.textContent = `${point.number}. ${point.title} — ${point.dayLabel}`;
      const marker = L.marker([point.latitude, point.longitude], { icon: markerIcon(point.number) })
        .bindTooltip(tooltipContent, { direction: 'top', offset: [0, -16] })
        .on('click', () => onPointSelect(point.itemId));
      marker.addTo(markerLayer);
    }

    if (points.length === 1) {
      map.setView(bounds.getCenter(), 14, { animate: false });
    } else {
      map.fitBounds(bounds.pad(0.18), { maxZoom: 14, animate: false });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [points, onPointSelect]);

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
            <h3 className="text-sm font-bold text-slate-900">Mapa do Roteiro</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {points.length > 0
                ? `${points.length} parada${points.length === 1 ? '' : 's'} localizada${points.length === 1 ? '' : 's'} • clique em um número para abrir a atividade`
                : 'As paradas com localização verificada aparecerão aqui.'}
            </p>
            {refreshMessage && <p className="mt-1 text-xs font-medium text-sky-700" role="status">{refreshMessage}</p>}
            {refreshError && <p className="mt-1 text-xs font-medium text-amber-700" role="alert">{refreshError}</p>}
          </div>
        </div>

        {canRefresh && onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 sm:self-auto"
            title="Pesquisar novamente as localizações do roteiro"
          >
            {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isRefreshing ? 'Localizando...' : 'Atualizar pontos'}
          </button>
        )}
      </div>

      <div className="relative h-[320px] sm:h-[390px]">
        <div ref={containerRef} className="h-full w-full" />
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
