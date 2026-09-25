import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, FileText, Users, Clock, ShieldCheck } from 'lucide-react';
import { Trip } from '../types/index.js';
import { formatDateRange } from '../utils/date.js';

interface TripCardProps {
  trip: Trip;
}

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  PLANNING: { label: 'Planejamento', bg: 'bg-amber-100', text: 'text-amber-800' },
  CONFIRMED: { label: 'Confirmada', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  IN_PROGRESS: { label: 'Em Andamento', bg: 'bg-blue-100', text: 'text-blue-800' },
  COMPLETED: { label: 'Concluída', bg: 'bg-slate-100', text: 'text-slate-700' },
  ARCHIVED: { label: 'Arquivada', bg: 'bg-zinc-100', text: 'text-zinc-600' },
};

export const TripCard: React.FC<TripCardProps> = ({ trip }) => {
  const statusInfo = statusMap[trip.status] || statusMap.PLANNING;
  const primaryColor = trip.theme?.primary || '#b94a5d';

  const dateRangeDisplay = formatDateRange(trip.start_date, trip.end_date);

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-slate-300 transition-all duration-300 flex flex-col overflow-hidden relative"
    >
      {/* Top Banner & Cover Image */}
      <div className="relative h-48 w-full overflow-hidden bg-slate-100">
        {trip.cover_image_url ? (
          <img
            src={trip.cover_image_url}
            alt={trip.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white/90 font-serif text-3xl font-bold"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, #334155)` }}
          >
            {trip.title}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md ${statusInfo.bg} ${statusInfo.text}`}>
            {statusInfo.label}
          </span>

          {trip.user_role && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/40 text-white backdrop-blur-md flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-brand-300" />
              {trip.user_role}
            </span>
          )}
        </div>

        {/* Bottom Destination in Cover */}
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <div className="flex items-center gap-1 text-xs text-white/80 font-medium">
            <MapPin className="w-3.5 h-3.5 text-brand-300" />
            <span className="truncate">{trip.destination_summary || trip.primary_country || 'Destino'}</span>
          </div>
          <h3 className="text-xl font-bold tracking-tight font-serif truncate mt-0.5">
            {trip.title} {trip.subtitle ? <span className="font-sans font-light text-sm ml-1 text-white/90">{trip.subtitle}</span> : ''}
          </h3>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          {trip.tagline && (
            <p className="text-xs text-slate-500 italic mb-3 line-clamp-1">
              "{trip.tagline}"
            </p>
          )}

          {/* Date info */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700 mb-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{dateRangeDisplay}</span>
          </div>
        </div>

        {/* Footer Meta Strip */}
        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1" title="Documentos e Vouchers">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <strong>{trip.documents_count || 0}</strong>
            </span>
            <span className="flex items-center gap-1" title="Participantes">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <strong>{trip.members_count || 1}</strong>
            </span>
            <span className="flex items-center gap-1" title="Dias programados">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <strong>{trip.days_count || 0}d</strong>
            </span>
          </div>

          {/* Theme Preset Badge */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: primaryColor }}
              title={`Tema: ${trip.theme?.preset || 'Padrão'}`}
            />
            <span className="text-[11px] capitalize text-slate-400">{trip.theme?.preset || 'Sakura'}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};
