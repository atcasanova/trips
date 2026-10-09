import React, { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { MapPin, Maximize2, ChevronDown, ChevronUp, Hotel, Plane } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export type DayMapPointType = 'ACTIVITY' | 'HOTEL' | 'AIRPORT';

export interface DayMapPoint {
  itemId: string;
  number?: number;
  title: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  pointType?: DayMapPointType;
  airportCode?: string;
}

interface DayMiniMapProps {
  dayNumber: number;
  dayTitle: string;
  points: DayMapPoint[];
  accentColor?: string;
  onSelectPoint?: (itemId: string) => void;
  onExpandToMainMap?: () => void;
}

const miniMarkerIcon = (point: DayMapPoint, color: string) => {
  if (point.pointType === 'HOTEL') {
    return L.divIcon({
      className: 'itinerary-mini-marker-wrapper',
      html: `
        <span class="itinerary-mini-marker itinerary-mini-marker-hotel" aria-label="Hotel: ${point.title}" title="Hotel: ${point.title}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M6 14h12"/>
            <path d="M6 18v2"/>
            <path d="M18 18v2"/>
            <path d="M2 11h20"/>
          </svg>
        </span>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  if (point.pointType === 'AIRPORT') {
    return L.divIcon({
      className: 'itinerary-mini-marker-wrapper',
      html: `
        <span class="itinerary-mini-marker itinerary-mini-marker-airport" aria-label="Aeroporto: ${point.title}" title="Aeroporto: ${point.title}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
          </svg>
        </span>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  const num = point.number || 1;
  return L.divIcon({
    className: 'itinerary-mini-marker-wrapper',
    html: `<span class="itinerary-mini-marker" style="background-color: ${color}" aria-label="Parada ${num}">${num}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
};

export const DayMiniMap: React.FC<DayMiniMapProps> = ({
  dayNumber,
  dayTitle,
  points,
  accentColor = '#b94a5d',
  onSelectPoint,
  onExpandToMainMap,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (isCollapsed || !containerRef.current || points.length === 0) return;

    // Initialize clean static Leaflet map
    const map = L.map(containerRef.current, {
      center: [points[0].latitude, points[0].longitude],
      zoom: 13,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    const markerLayer = L.layerGroup().addTo(map);

    // Add markers for points of this day
    for (const point of points) {
      const tooltipContent = document.createElement('span');
      if (point.pointType === 'HOTEL') {
        tooltipContent.textContent = `🏨 ${point.title}${point.subtitle ? ` (${point.subtitle})` : ''}`;
      } else if (point.pointType === 'AIRPORT') {
        tooltipContent.textContent = `✈️ ${point.title}${point.subtitle ? ` (${point.subtitle})` : ''}`;
      } else {
        tooltipContent.textContent = `${point.number}. ${point.title}`;
      }

      const marker = L.marker([point.latitude, point.longitude], {
        icon: miniMarkerIcon(point, accentColor),
      })
        .bindTooltip(tooltipContent, { direction: 'top', offset: [0, -11] })
        .on('click', () => {
          if (onSelectPoint) onSelectPoint(point.itemId);
        });
      marker.addTo(markerLayer);
    }

    // Set view or fit bounds
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14, { animate: false });
    } else {
      const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as L.LatLngTuple));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 15, animate: false });
    }

    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [points, accentColor, isCollapsed]);

  if (points.length === 0) {
    return null;
  }

  const activityCount = points.filter((p) => p.pointType === 'ACTIVITY' || !p.pointType).length;
  const hotelCount = points.filter((p) => p.pointType === 'HOTEL').length;
  const airportCount = points.filter((p) => p.pointType === 'AIRPORT').length;

  return (
    <div className="my-3 rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs relative z-0 isolate">
      {/* Mini-map header strip */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expandir mapa do dia' : 'Recolher mapa do dia'}
        >
          <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <span className="text-[11px] flex items-center gap-1.5 flex-wrap">
            <span>Mapa do dia:</span>
            {activityCount > 0 && (
              <span className="font-semibold text-slate-900">
                {activityCount} {activityCount === 1 ? 'parada' : 'paradas'}
              </span>
            )}
            {hotelCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-medium text-[10px]">
                <Hotel className="w-2.5 h-2.5" />
                Hotel
              </span>
            )}
            {airportCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded font-medium text-[10px]">
                <Plane className="w-2.5 h-2.5" />
                Aeroporto
              </span>
            )}
          </span>
          {isCollapsed ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {!isCollapsed && onExpandToMainMap && (
          <button
            type="button"
            onClick={onExpandToMainMap}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:text-brand-800 transition-colors cursor-pointer ml-auto"
            title="Ver no mapa geral interativo"
          >
            <Maximize2 className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Ver no mapa geral</span>
          </button>
        )}
      </div>

      {/* Static Mini Map View */}
      {!isCollapsed && (
        <div className="relative h-32 sm:h-36 w-full bg-slate-100">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      )}
    </div>
  );
};
