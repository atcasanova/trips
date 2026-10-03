import React, { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { MapPin, Maximize2, ChevronDown, ChevronUp } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export interface DayMapPoint {
  itemId: string;
  number: number;
  title: string;
  latitude: number;
  longitude: number;
}

interface DayMiniMapProps {
  dayNumber: number;
  dayTitle: string;
  points: DayMapPoint[];
  accentColor?: string;
  onSelectPoint?: (itemId: string) => void;
  onExpandToMainMap?: () => void;
}

const miniMarkerIcon = (number: number, color: string) =>
  L.divIcon({
    className: 'itinerary-mini-marker-wrapper',
    html: `<span class="itinerary-mini-marker" style="background-color: ${color}" aria-label="Parada ${number}">${number}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

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
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
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
      tooltipContent.textContent = `${point.number}. ${point.title}`;
      const marker = L.marker([point.latitude, point.longitude], {
        icon: miniMarkerIcon(point.number, accentColor),
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
      map.fitBounds(bounds.pad(0.28), { maxZoom: 15, animate: false });
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

  return (
    <div className="my-3 rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs relative z-0 isolate">
      {/* Mini-map header strip */}
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
          title={isCollapsed ? 'Expandir mapa do dia' : 'Recolher mapa do dia'}
        >
          <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <span className="text-[11px]">
            Mapa do dia • {points.length} {points.length === 1 ? 'parada' : 'paradas'}
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
            className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:text-brand-800 transition-colors cursor-pointer"
            title="Ver no mapa geral interativo"
          >
            <Maximize2 className="w-2.5 h-2.5" />
            <span className="hidden sm:inline">Ver no mapa geral</span>
          </button>
        )}
      </div>

      {/* Static Mini Map View */}
      {!isCollapsed && (
        <div className="relative h-28 sm:h-32 w-full bg-slate-100">
          <div ref={containerRef} className="h-full w-full" />
        </div>
      )}
    </div>
  );
};
