import React, { useState, useMemo } from 'react';
import {
  Calendar,
  MapPin,
  Plane,
  Train,
  Bus,
  Car,
  Ship,
  Building,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  ExternalLink,
  BedDouble,
  Info,
  Route,
  Luggage,
  Plus,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import {
  Trip,
  TripDay,
  TransportReservation,
  TransportSegment,
  HotelReservation,
} from '../types/index.js';
import { formatDateBr, formatDateRange, parseSafeDate } from '../utils/date.js';

interface MacroTimelineViewProps {
  trip: Trip;
  days: TripDay[];
  transports: TransportReservation[];
  hotels: HotelReservation[];
  onRefresh?: () => void;
  canEdit?: boolean;
  onNavigateTab?: (tab: string) => void;
}

// Normalized YYYY-MM-DD helper
function toIsoDateStr(val?: string | Date | null): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    return val.split('T')[0].trim();
  }
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function addDays(dateStr: string, numDays: number): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + numDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(dateStrA: string, dateStrB: string): number {
  const partsA = dateStrA.split('-').map(Number);
  const partsB = dateStrB.split('-').map(Number);
  const da = new Date(partsA[0], partsA[1] - 1, partsA[2]);
  const db = new Date(partsB[0], partsB[1] - 1, partsB[2]);
  const diffTime = db.getTime() - da.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export interface DayTimelineItem {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  dateObj: Date;
  weekdayName: string;
  monthShort: string;
  dayOfMonth: string;
  formattedBr: string;
  isTripBoundary: 'START' | 'END' | 'BOTH' | 'INSIDE' | 'BEFORE' | 'AFTER';
  tripDay?: TripDay;
  baseCity: string;
  departingSegments: Array<{
    segment: TransportSegment;
    reservation: TransportReservation;
    isOvernight: boolean;
  }>;
  arrivingSegments: Array<{
    segment: TransportSegment;
    reservation: TransportReservation;
    departedYesterday: boolean;
  }>;
  hotelCheckIns: HotelReservation[];
  hotelCheckOuts: HotelReservation[];
  hotelActiveNights: Array<{
    hotel: HotelReservation;
    nightIndex: number;
    totalNights: number;
  }>;
  alerts: Array<{
    id: string;
    type: 'NO_LODGING' | 'HOTEL_CONFLICT' | 'ROUTE_GAP' | 'OUT_OF_BOUNDS' | 'CUSTOM';
    severity: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    actionTab?: string;
    actionLabel?: string;
  }>;
}

export const MacroTimelineView: React.FC<MacroTimelineViewProps> = ({
  trip,
  days,
  transports,
  hotels,
  onRefresh,
  canEdit = false,
  onNavigateTab,
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'ALERTS' | 'TRANSPORTS' | 'HOTELS'>('ALL');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const primaryColor = trip.theme?.primary || '#b94a5d';

  // 1. Compile all segments with their parent reservation
  const allSegmentsWithParent = useMemo(() => {
    const list: Array<{ segment: TransportSegment; reservation: TransportReservation }> = [];
    for (const tr of transports) {
      if (Array.isArray(tr.segments)) {
        for (const seg of tr.segments) {
          list.push({ segment: seg, reservation: tr });
        }
      }
    }
    // Sort chronologically by departure date & time
    list.sort((a, b) => {
      const da = (toIsoDateStr(a.segment.departure_date) || '') + (a.segment.departure_time || '00:00');
      const db = (toIsoDateStr(b.segment.departure_date) || '') + (b.segment.departure_time || '00:00');
      return da.localeCompare(db);
    });
    return list;
  }, [transports]);

  // 2. Identify master date range
  const { dateList, tripStartDateStr, tripEndDateStr } = useMemo(() => {
    const tripStart = toIsoDateStr(trip.start_date);
    const tripEnd = toIsoDateStr(trip.end_date);

    let minDate = tripStart;
    let maxDate = tripEnd;

    // Check all segments
    for (const item of allSegmentsWithParent) {
      const dDep = toIsoDateStr(item.segment.departure_date);
      const dArr = toIsoDateStr(item.segment.arrival_date);
      if (dDep) {
        if (!minDate || dDep < minDate) minDate = dDep;
        if (!maxDate || dDep > maxDate) maxDate = dDep;
      }
      if (dArr) {
        if (!minDate || dArr < minDate) minDate = dArr;
        if (!maxDate || dArr > maxDate) maxDate = dArr;
      }
    }

    // Check all hotels
    for (const h of hotels) {
      const dIn = toIsoDateStr(h.check_in_date);
      const dOut = toIsoDateStr(h.check_out_date);
      if (dIn) {
        if (!minDate || dIn < minDate) minDate = dIn;
        if (!maxDate || dIn > maxDate) maxDate = dIn;
      }
      if (dOut) {
        if (!minDate || dOut < minDate) minDate = dOut;
        if (!maxDate || dOut > maxDate) maxDate = dOut;
      }
    }

    // Check trip days
    for (const d of days) {
      const dDate = toIsoDateStr(d.date);
      if (dDate) {
        if (!minDate || dDate < minDate) minDate = dDate;
        if (!maxDate || dDate > maxDate) maxDate = dDate;
      }
    }

    if (!minDate && !maxDate) {
      return { dateList: [], tripStartDateStr: null, tripEndDateStr: null };
    }

    const start = minDate || maxDate!;
    const end = maxDate || minDate!;

    const dates: string[] = [];
    let curr = start;
    let guard = 0;
    while (curr <= end && guard < 366) {
      dates.push(curr);
      curr = addDays(curr, 1);
      guard++;
    }

    return {
      dateList: dates,
      tripStartDateStr: tripStart,
      tripEndDateStr: tripEnd,
    };
  }, [trip.start_date, trip.end_date, allSegmentsWithParent, hotels, days]);

  // 3. Build day-by-day models with gap and logistics diagnostics
  const timelineDays = useMemo(() => {
    if (dateList.length === 0) return [];

    const tripStart = tripStartDateStr;
    const tripEnd = tripEndDateStr;

    // Map days by date
    const daysByDate = new Map<string, TripDay>();
    for (const d of days) {
      const iso = toIsoDateStr(d.date);
      if (iso) daysByDate.set(iso, d);
    }

    let lastKnownCity =
      trip.cities && trip.cities.length > 0
        ? trip.cities[0]
        : trip.destination_summary || 'Destino';

    const result: DayTimelineItem[] = [];

    // Pre-calculate transport route gaps between consecutive segments
    const routeGapAlertsByDate = new Map<string, { title: string; description: string }>();
    for (let i = 0; i < allSegmentsWithParent.length - 1; i++) {
      const currSeg = allSegmentsWithParent[i].segment;
      const nextSeg = allSegmentsWithParent[i + 1].segment;

      const currArrLoc = (currSeg.arrival_location || '').trim().toLowerCase();
      const currArrCode = (currSeg.arrival_station_code || '').trim().toUpperCase();
      const nextDepLoc = (nextSeg.departure_location || '').trim().toLowerCase();
      const nextDepCode = (nextSeg.departure_station_code || '').trim().toUpperCase();

      const sameCityOrCode =
        (currArrCode && nextDepCode && currArrCode === nextDepCode) ||
        (currArrLoc && nextDepLoc && (currArrLoc.includes(nextDepLoc) || nextDepLoc.includes(currArrLoc)));

      if (!sameCityOrCode && currArrLoc && nextDepLoc) {
        const nextDepDate = toIsoDateStr(nextSeg.departure_date);
        if (nextDepDate) {
          routeGapAlertsByDate.set(nextDepDate, {
            title: 'Descontinuidade de transporte entre trechos',
            description: `O trecho anterior desembarcou em "${currSeg.arrival_location}" (${currArrCode || 'aeroporto'}), mas o próximo trecho parte de "${nextSeg.departure_location}" (${nextDepCode || 'aeroporto'}). Verifique a necessidade de transfer ou transporte terrestre intermediário.`,
          });
        }
      }
    }

    for (let i = 0; i < dateList.length; i++) {
      const dStr = dateList[i];
      const parsedDate = parseSafeDate(dStr) || new Date();
      const tripDay = daysByDate.get(dStr);

      // Determine day number
      let dayNumber = i + 1;
      if (tripStart) {
        const diff = diffDays(tripStart, dStr);
        dayNumber = diff + 1;
      }

      // Boundary check
      let isTripBoundary: DayTimelineItem['isTripBoundary'] = 'INSIDE';
      if (tripStart && dStr < tripStart) {
        isTripBoundary = 'BEFORE';
      } else if (tripEnd && dStr > tripEnd) {
        isTripBoundary = 'AFTER';
      } else if (tripStart && tripEnd && dStr === tripStart && dStr === tripEnd) {
        isTripBoundary = 'BOTH';
      } else if (tripStart && dStr === tripStart) {
        isTripBoundary = 'START';
      } else if (tripEnd && dStr === tripEnd) {
        isTripBoundary = 'END';
      }

      // Departing segments on dStr
      const departingSegments = allSegmentsWithParent
        .filter((item) => toIsoDateStr(item.segment.departure_date) === dStr)
        .map((item) => {
          const arrDate = toIsoDateStr(item.segment.arrival_date);
          const isOvernight = arrDate ? arrDate > dStr : false;
          return {
            segment: item.segment,
            reservation: item.reservation,
            isOvernight,
          };
        });

      // Arriving segments on dStr
      const arrivingSegments = allSegmentsWithParent
        .filter((item) => toIsoDateStr(item.segment.arrival_date) === dStr)
        .map((item) => {
          const depDate = toIsoDateStr(item.segment.departure_date);
          const departedYesterday = depDate ? depDate < dStr : false;
          return {
            segment: item.segment,
            reservation: item.reservation,
            departedYesterday,
          };
        });

      // Hotels check-in and check-out on dStr
      const hotelCheckIns = hotels.filter((h) => toIsoDateStr(h.check_in_date) === dStr);
      const hotelCheckOuts = hotels.filter((h) => toIsoDateStr(h.check_out_date) === dStr);

      // Hotels active for the night of dStr (staying overnight from dStr to dStr + 1)
      const hotelActiveNights: DayTimelineItem['hotelActiveNights'] = [];
      for (const h of hotels) {
        const cIn = toIsoDateStr(h.check_in_date);
        const cOut = toIsoDateStr(h.check_out_date);
        if (cIn && cOut && cIn <= dStr && dStr < cOut) {
          const totalNights = Math.max(1, diffDays(cIn, cOut));
          const nightIndex = diffDays(cIn, dStr) + 1;
          hotelActiveNights.push({
            hotel: h,
            nightIndex,
            totalNights,
          });
        }
      }

      // Base City determination
      let baseCity = lastKnownCity;
      if (tripDay?.base_location) {
        baseCity = tripDay.base_location;
      } else if (hotelActiveNights.length > 0 && hotelActiveNights[0].hotel.city) {
        baseCity = hotelActiveNights[0].hotel.city;
      } else if (arrivingSegments.length > 0 && arrivingSegments[0].segment.arrival_location) {
        baseCity = arrivingSegments[0].segment.arrival_location;
      } else if (departingSegments.length > 0 && departingSegments[0].segment.departure_location) {
        baseCity = departingSegments[0].segment.departure_location;
      }
      lastKnownCity = baseCity;

      // Alerts & Diagnostics for this day
      const dayAlerts: DayTimelineItem['alerts'] = [];

      // 1. Out of bounds alerts
      if (isTripBoundary === 'BEFORE') {
        dayAlerts.push({
          id: `out-before-${dStr}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Reserva antes do início oficial da viagem',
          description: `Esta data é anterior ao início da viagem (${formatDateBr(tripStart)}).`,
        });
      } else if (isTripBoundary === 'AFTER') {
        dayAlerts.push({
          id: `out-after-${dStr}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Reserva após o término oficial da viagem',
          description: `Esta data ultrapassa a data final da viagem (${formatDateBr(tripEnd)}).`,
        });
      }

      // 2. Hotel conflict / multiple reservations for the same night
      if (hotelActiveNights.length > 1) {
        const names = hotelActiveNights.map((item) => item.hotel.hotel_name).join(' e ');
        dayAlerts.push({
          id: `conflict-hotel-${dStr}`,
          type: 'HOTEL_CONFLICT',
          severity: 'error',
          title: 'Sobreposição de hospedagens',
          description: `Existem ${hotelActiveNights.length} reservas simultâneas para esta noite: ${names}.`,
          actionTab: 'hotels',
          actionLabel: 'Ver Hospedagens',
        });
      }

      // 3. Missing lodging check:
      // A night needs a hotel if it's within the trip dates (strictly before tripEnd),
      // EXCEPT if traveler is on an overnight transport!
      const isNightWithinTrip = tripEnd ? dStr < tripEnd : i < dateList.length - 1;
      const hasOvernightTransport = departingSegments.some((s) => s.isOvernight);

      if (isNightWithinTrip && hotelActiveNights.length === 0 && !hasOvernightTransport) {
        const nextDayStr = addDays(dStr, 1);
        dayAlerts.push({
          id: `no-hotel-${dStr}`,
          type: 'NO_LODGING',
          severity: 'warning',
          title: 'Sem hospedagem reservada para esta noite',
          description: `Não encontramos reserva de hotel ou pousada para a noite de ${formatDateBr(dStr)} para ${formatDateBr(nextDayStr)} em ${baseCity}.`,
          actionTab: 'hotels',
          actionLabel: '+ Reservar Hotel',
        });
      }

      // 4. Transport route gap
      if (routeGapAlertsByDate.has(dStr)) {
        const gap = routeGapAlertsByDate.get(dStr)!;
        dayAlerts.push({
          id: `route-gap-${dStr}`,
          type: 'ROUTE_GAP',
          severity: 'info',
          title: gap.title,
          description: gap.description,
          actionTab: 'transports',
          actionLabel: 'Ver Transportes',
        });
      }

      result.push({
        date: dStr,
        dayNumber,
        dateObj: parsedDate,
        weekdayName: WEEKDAYS[parsedDate.getDay()],
        monthShort: MONTHS_SHORT[parsedDate.getMonth()],
        dayOfMonth: String(parsedDate.getDate()).padStart(2, '0'),
        formattedBr: formatDateBr(dStr),
        isTripBoundary,
        tripDay,
        baseCity,
        departingSegments,
        arrivingSegments,
        hotelCheckIns,
        hotelCheckOuts,
        hotelActiveNights,
        alerts: dayAlerts,
      });
    }

    return result;
  }, [dateList, tripStartDateStr, tripEndDateStr, days, allSegmentsWithParent, hotels, trip.cities, trip.destination_summary]);

  // Overall Statistics & Health Metrics
  const stats = useMemo(() => {
    let totalAlerts = 0;
    let missingHotelNights = 0;
    let conflictNights = 0;
    let totalNights = 0;
    let coveredNights = 0;

    for (let i = 0; i < timelineDays.length; i++) {
      const d = timelineDays[i];
      totalAlerts += d.alerts.length;

      const isNight = i < timelineDays.length - 1;
      if (isNight) {
        totalNights++;
        const hasOvernightTransport = d.departingSegments.some((s) => s.isOvernight);
        if (d.hotelActiveNights.length > 0 || hasOvernightTransport) {
          coveredNights++;
        }
      }

      for (const a of d.alerts) {
        if (a.type === 'NO_LODGING') missingHotelNights++;
        if (a.type === 'HOTEL_CONFLICT') conflictNights++;
      }
    }

    const coveragePercentage = totalNights > 0 ? Math.round((coveredNights / totalNights) * 100) : 100;

    const daysWithAlerts = timelineDays.filter((d) => d.alerts.length > 0).length;
    const daysWithTransports = timelineDays.filter(
      (d) => d.departingSegments.length > 0 || d.arrivingSegments.length > 0
    ).length;
    const daysWithHotels = timelineDays.filter(
      (d) => d.hotelCheckIns.length > 0 || d.hotelCheckOuts.length > 0 || d.hotelActiveNights.length > 0
    ).length;

    return {
      totalAlerts,
      missingHotelNights,
      conflictNights,
      totalNights,
      coveredNights,
      coveragePercentage,
      daysWithAlerts,
      daysWithTransports,
      daysWithHotels,
      totalDays: timelineDays.length,
      totalSegments: allSegmentsWithParent.length,
      totalHotels: hotels.length,
    };
  }, [timelineDays, allSegmentsWithParent, hotels]);

  // Filtered timeline days
  const filteredDays = useMemo(() => {
    switch (filterMode) {
      case 'ALERTS':
        return timelineDays.filter((d) => d.alerts.length > 0);
      case 'TRANSPORTS':
        return timelineDays.filter(
          (d) => d.departingSegments.length > 0 || d.arrivingSegments.length > 0
        );
      case 'HOTELS':
        return timelineDays.filter(
          (d) => d.hotelCheckIns.length > 0 || d.hotelCheckOuts.length > 0 || d.hotelActiveNights.length > 0
        );
      default:
        return timelineDays;
    }
  }, [timelineDays, filterMode]);

  const getTransportIcon = (type: string) => {
    switch (type) {
      case 'TRAIN':
        return <Train className="w-4 h-4 text-indigo-600" />;
      case 'BUS':
        return <Bus className="w-4 h-4 text-emerald-600" />;
      case 'CAR':
        return <Car className="w-4 h-4 text-amber-600" />;
      case 'BOAT':
        return <Ship className="w-4 h-4 text-cyan-600" />;
      default:
        return <Plane className="w-4 h-4 text-sky-600 -rotate-45" />;
    }
  };

  if (timelineDays.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
          <Route className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Nenhuma data ou reserva encontrada</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Defina as datas de início e fim da viagem nas configurações ou envie passagens aéreas e confirmações de hotel na aba Documentos para gerar a timeline automaticamente.
        </p>
        {canEdit && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => onNavigateTab?.('transports')}
              className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 transition-colors"
            >
              Adicionar Voos
            </button>
            <button
              onClick={() => onNavigateTab?.('hotels')}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              Adicionar Hotéis
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Diagnostics Dashboard */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Route className="w-5 h-5" style={{ color: primaryColor }} />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold font-serif text-slate-900">
                  Timeline Macro & Verificação de Datas
                </h2>
                <p className="text-xs text-slate-500">
                  Visão cronológica dia a dia com voos, hospedagens, cidades e detecção automática de noites sem hotel ou erros de datas.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Date Range Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 self-start md:self-auto">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold">{formatDateRange(trip.start_date, trip.end_date)}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">{stats.totalDays} dias / {stats.totalNights} noites</span>
          </div>
        </div>

        {/* Diagnostic Status Box */}
        {stats.totalAlerts === 0 ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start sm:items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <div className="flex-1 text-xs">
              <span className="font-bold">Logística e Datas 100% Cobertas!</span> Todas as noites da viagem possuem hospedagem confirmada ou voo noturno registrado, sem conflitos detectados.
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start sm:items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-xs">
                <span className="font-bold">Atenção à Logística:</span> Encontramos{' '}
                <strong>{stats.totalAlerts} ponto{stats.totalAlerts > 1 ? 's' : ''} de atenção</strong> nas datas desta viagem
                {stats.missingHotelNights > 0 && ` (${stats.missingHotelNights} noite${stats.missingHotelNights > 1 ? 's' : ''} sem hotel)`}
                {stats.conflictNights > 0 && ` (${stats.conflictNights} sobreposição de reservas)`}.
              </div>
            </div>

            <button
              onClick={() => setFilterMode(filterMode === 'ALERTS' ? 'ALL' : 'ALERTS')}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shrink-0"
            >
              {filterMode === 'ALERTS' ? 'Mostrar Todos os Dias' : 'Filtrar Apenas Alertas'}
            </button>
          </div>
        )}

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* Lodging Coverage */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <BedDouble className="w-3.5 h-3.5 text-indigo-600" />
              Cobertura de Hotéis
            </span>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-base sm:text-lg font-bold text-slate-900">
                  {stats.coveredNights}/{stats.totalNights}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {stats.coveragePercentage}%
                </span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-500 ${
                    stats.coveragePercentage === 100
                      ? 'bg-emerald-500'
                      : stats.coveragePercentage >= 60
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${stats.coveragePercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Transports Count */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-sky-600 -rotate-45" />
              Trechos de Voo/Trem
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                {stats.totalSegments} trecho{stats.totalSegments !== 1 ? 's' : ''}
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {stats.daysWithTransports} dias
              </span>
            </div>
          </div>

          {/* Hotels Count */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-emerald-600" />
              Hotéis Reservados
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                {stats.totalHotels} {stats.totalHotels === 1 ? 'hotel' : 'hotéis'}
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {stats.daysWithHotels} dias
              </span>
            </div>
          </div>

          {/* Pending Alerts */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col justify-between ${
              stats.totalAlerts > 0
                ? 'bg-amber-50/60 border-amber-200'
                : 'bg-emerald-50/60 border-emerald-200'
            }`}
          >
            <span className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <AlertCircle className={`w-3.5 h-3.5 ${stats.totalAlerts > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
              Inconsistências
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                className={`text-base sm:text-lg font-bold ${
                  stats.totalAlerts > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {stats.totalAlerts === 0 ? 'Nenhuma' : `${stats.totalAlerts} alerta${stats.totalAlerts > 1 ? 's' : ''}`}
              </span>
              {stats.totalAlerts > 0 && (
                <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-100/80 px-1.5 py-0.5 rounded">
                  Revisar
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filtrar:
            </span>
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos os Dias ({stats.totalDays})
            </button>
            {stats.totalAlerts > 0 && (
              <button
                onClick={() => setFilterMode('ALERTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  filterMode === 'ALERTS'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/80'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Com Alertas ({stats.daysWithAlerts})
              </button>
            )}
            <button
              onClick={() => setFilterMode('TRANSPORTS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                filterMode === 'TRANSPORTS'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/80'
              }`}
            >
              <Plane className="w-3 h-3 -rotate-45" />
              Voos & Trens ({stats.daysWithTransports})
            </button>
            <button
              onClick={() => setFilterMode('HOTELS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                filterMode === 'HOTELS'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80'
              }`}
            >
              <Building className="w-3 h-3" />
              Hotéis & Estadias ({stats.daysWithHotels})
            </button>
          </div>

          {filterMode !== 'ALL' && (
            <button
              onClick={() => setFilterMode('ALL')}
              className="text-xs text-brand-600 hover:underline font-semibold"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* 2. Chronological Timeline List */}
      <div className="space-y-4">
        {filteredDays.map((dayItem, index) => {
          const isSelected = selectedDate === dayItem.date;
          const hasAlerts = dayItem.alerts.length > 0;
          const isToday =
            toIsoDateStr(new Date()) === dayItem.date;

          return (
            <div
              key={dayItem.date}
              id={`day-${dayItem.date}`}
              className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm ${
                hasAlerts
                  ? 'border-amber-300 ring-1 ring-amber-200/50'
                  : isToday
                  ? 'border-brand-300 ring-1 ring-brand-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Left Column: Day & Date Header Badge */}
                  <div className="md:w-56 shrink-0 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-2 pb-3 md:pb-0 border-b md:border-b-0 md:border-r border-slate-100 md:pr-4">
                    <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Dia {dayItem.dayNumber > 0 ? String(dayItem.dayNumber).padStart(2, '0') : 'Extra'}
                        </span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                            Hoje
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1.5 md:mt-1">
                        <span className="text-xl sm:text-2xl font-extrabold font-sans text-slate-900 tracking-tight">
                          {dayItem.dayOfMonth} {dayItem.monthShort}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {dayItem.dateObj.getFullYear()}
                        </span>
                      </div>

                      <span className="text-xs text-slate-500 font-medium capitalize hidden md:inline">
                        {dayItem.weekdayName}
                      </span>
                    </div>

                    {/* Macro City / Base Location Pill */}
                    <div className="flex flex-col md:w-full md:mt-3">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/80 text-xs font-bold text-slate-800 truncate">
                        <MapPin className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                        <span className="truncate">{dayItem.baseCity}</span>
                      </div>

                      {/* Day Title if exists and different */}
                      {dayItem.tripDay?.title && dayItem.tripDay.title !== dayItem.baseCity && (
                        <p className="text-[11px] text-slate-500 truncate mt-1 italic hidden md:block">
                          {dayItem.tripDay.title}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Events & Cards on this Day */}
                  <div className="flex-1 space-y-3">
                    {/* A. Alerts & Warnings (if any) */}
                    {dayItem.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                          alert.severity === 'error'
                            ? 'bg-rose-50 border-rose-200 text-rose-950'
                            : alert.severity === 'warning'
                            ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                            : 'bg-sky-50 border-sky-200 text-sky-950'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {alert.severity === 'error' ? (
                            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          ) : alert.severity === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <strong className="font-bold block">{alert.title}</strong>
                            <p className="text-[11px] mt-0.5 opacity-90">{alert.description}</p>
                          </div>
                        </div>

                        {canEdit && alert.actionTab && onNavigateTab && (
                          <button
                            onClick={() => onNavigateTab(alert.actionTab!)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm ${
                              alert.severity === 'error'
                                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                : alert.severity === 'warning'
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-sky-600 hover:bg-sky-700 text-white'
                            }`}
                          >
                            {alert.actionLabel || 'Resolver'}
                          </button>
                        )}
                      </div>
                    ))}

                    {/* B. Overnight Flight Arrivals from previous day */}
                    {dayItem.arrivingSegments
                      .filter((s) => s.departedYesterday)
                      .map((arrItem, idx) => (
                        <div
                          key={`arr-${arrItem.segment.id || idx}`}
                          className="p-3.5 bg-sky-50/60 rounded-xl border border-sky-200/80 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                              <Plane className="w-4 h-4 rotate-45" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900">
                                  Desembarque: {arrItem.segment.carrier_name || 'Voo'} {arrItem.segment.identification_number}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded">
                                  Chegada {arrItem.segment.arrival_time || 'Horário a definir'}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500">
                                Desembarque em <strong>{arrItem.segment.arrival_location}</strong> ({arrItem.segment.arrival_station_code || 'aeroporto'}) • Vindo de {arrItem.segment.departure_location}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                    {/* C. Hotel Check-outs */}
                    {dayItem.hotelCheckOuts.map((h) => (
                      <div
                        key={`cout-${h.id}`}
                        className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/70 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                            <Building className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>Check-out: {h.hotel_name}</span>
                              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded">
                                Até {h.check_out_time || '11:00'}
                              </span>
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {h.city || 'Destino'} • Estadia finalizada
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* D. Transport Departures (Flights, Trains, etc.) */}
                    {dayItem.departingSegments.map((depItem, idx) => {
                      const seg = depItem.segment;
                      const res = depItem.reservation;
                      const bookingCode = res.booking_code;

                      // Passengers and seats
                      const paxList: Array<{ name: string; seat?: string | null }> = Array.isArray(seg.passengers) && seg.passengers.length > 0
                        ? seg.passengers
                        : Array.isArray(seg.passenger_names)
                        ? seg.passenger_names.map((p: any) => (typeof p === 'string' ? { name: p } : { name: p.name || p.displayName, seat: p.seat }))
                        : [];

                      return (
                        <div
                          key={`dep-${seg.id || idx}`}
                          className="p-4 bg-gradient-to-r from-sky-50/70 to-white rounded-xl border border-sky-200 shadow-sm space-y-3"
                        >
                          {/* Segment Header */}
                          <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-sky-100">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-sky-100 rounded-lg">
                                {getTransportIcon(seg.transport_type)}
                              </div>
                              <span className="font-bold text-xs sm:text-sm text-slate-900">
                                {seg.carrier_name || 'Companhia Aérea'}
                                {seg.identification_number ? ` • ${seg.identification_number}` : ''}
                              </span>
                              {seg.cabin_class && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {seg.cabin_class}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {bookingCode && (
                                <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-mono text-[11px] font-bold rounded-md border border-sky-200">
                                  PNR: {bookingCode}
                                </span>
                              )}
                              {depItem.isOvernight && (
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-md">
                                  🌙 Voo Noturno (+1 dia)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Segment Route Times & Stations */}
                          <div className="flex items-center justify-between gap-2 sm:gap-6 py-1">
                            {/* Departure */}
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-base sm:text-lg font-mono font-bold text-slate-900">
                                  {seg.departure_time || '--:--'}
                                </span>
                                <span className="text-sm sm:text-base font-extrabold text-sky-700">
                                  {seg.departure_station_code || '---'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 font-medium truncate">
                                {seg.departure_location}
                              </p>
                            </div>

                            {/* Middle Connector Bar */}
                            <div className="flex-1 flex flex-col items-center justify-center px-2">
                              <span className="text-[10px] text-slate-400 font-semibold mb-0.5">
                                {seg.duration_minutes
                                  ? `${Math.floor(seg.duration_minutes / 60)}h ${seg.duration_minutes % 60}m`
                                  : 'Direto'}
                              </span>
                              <div className="w-full flex items-center">
                                <div className="h-0.5 flex-1 bg-sky-300" />
                                <Plane className="w-3.5 h-3.5 text-sky-600 shrink-0 mx-1 -rotate-45" />
                                <div className="h-0.5 flex-1 bg-sky-300" />
                              </div>
                              {seg.layover_minutes ? (
                                <span className="text-[10px] text-amber-600 font-bold mt-0.5">
                                  Conexão {Math.floor(seg.layover_minutes / 60)}h {seg.layover_minutes % 60}m
                                </span>
                              ) : null}
                            </div>

                            {/* Arrival */}
                            <div className="text-right min-w-0">
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-sm sm:text-base font-extrabold text-sky-700">
                                  {seg.arrival_station_code || '---'}
                                </span>
                                <span className="text-base sm:text-lg font-mono font-bold text-slate-900">
                                  {seg.arrival_time || '--:--'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 font-medium truncate">
                                {seg.arrival_location}
                              </p>
                            </div>
                          </div>

                          {/* Passengers & Seats */}
                          {paxList.length > 0 && (
                            <div className="pt-2 border-t border-sky-100 flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-[11px] font-semibold text-slate-400">Passageiros:</span>
                              {paxList.map((p, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700"
                                >
                                  <strong>{p.name}</strong>
                                  {p.seat && <span className="text-sky-700 font-mono font-bold">Assento {p.seat}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* E. Hotel Check-ins */}
                    {dayItem.hotelCheckIns.map((h) => {
                      const cIn = toIsoDateStr(h.check_in_date);
                      const cOut = toIsoDateStr(h.check_out_date);
                      const totalNights = cIn && cOut ? Math.max(1, diffDays(cIn, cOut)) : 1;

                      return (
                        <div
                          key={`cin-${h.id}`}
                          className="p-4 bg-gradient-to-r from-emerald-50/70 to-white rounded-xl border border-emerald-200 shadow-sm space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                                <Building className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-slate-900">{h.hotel_name}</span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                    Check-in (a partir de {h.check_in_time || '15:00'})
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {h.address || h.city || 'Endereço a confirmar'}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="px-2.5 py-1 bg-emerald-100/70 text-emerald-900 rounded-lg text-xs font-bold inline-block">
                                {totalNights} noite{totalNights > 1 ? 's' : ''} de estadia
                              </span>
                              {h.reservation_number && (
                                <span className="block text-[10px] font-mono text-slate-500 mt-0.5">
                                  Reserva: #{h.reservation_number}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Extra hotel details */}
                          <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                            <span>
                              Período: <strong>{formatDateBr(h.check_in_date)}</strong> até{' '}
                              <strong>{formatDateBr(h.check_out_date)}</strong>
                            </span>
                            {h.room_type && (
                              <span className="text-[11px] text-slate-500">
                                Tipo: {h.room_type}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* F. Hotel Active Ongoing Stays (intermediate nights) */}
                    {dayItem.hotelActiveNights
                      .filter(
                        (item) =>
                          !dayItem.hotelCheckIns.some((cin) => cin.id === item.hotel.id)
                      )
                      .map((activeItem, aIdx) => (
                        <div
                          key={`act-${activeItem.hotel.id || aIdx}`}
                          className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-slate-200 text-slate-700 rounded-lg">
                              <BedDouble className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-semibold text-slate-800">
                                Hospedado em: <strong>{activeItem.hotel.hotel_name}</strong>
                              </span>
                              <span className="text-slate-400 text-[11px] ml-2">
                                (Noite {activeItem.nightIndex} de {activeItem.totalNights})
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-slate-500">
                            {activeItem.hotel.city || 'Destino'}
                          </span>
                        </div>
                      ))}

                    {/* G. Macro Highlights of the Day (from itinerary if present) */}
                    {dayItem.tripDay?.subtitle && (
                      <div className="p-2.5 bg-slate-50/50 rounded-lg border border-slate-100 text-xs text-slate-600 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                        <span className="italic">{dayItem.tripDay.subtitle}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
