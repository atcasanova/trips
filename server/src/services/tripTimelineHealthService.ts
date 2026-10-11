import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { getAirportByCode } from '../utils/airportLocations.js';
import { TripStatus } from '../types/index.js';

export interface TripTimelineAlert {
  id: string;
  type: 'OUT_OF_BOUNDS' | 'HOTEL_CONFLICT' | 'NO_LODGING' | 'ROUTE_GAP' | 'NO_DATES';
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  date?: string;
}

export interface TripTimelineHealth {
  tripId: string;
  hasAlerts: boolean;
  totalAlerts: number;
  status: TripStatus;
  alerts: TripTimelineAlert[];
}

function toIsoDateStr(d: unknown): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d).trim();
  if (s.includes('T')) return s.split('T')[0];
  return s.slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeText(text?: string | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Grupos de aeroportos na mesma região metropolitana
const METRO_AIRPORT_GROUPS: string[][] = [
  ['NRT', 'HND', 'TYO'], // Tóquio
  ['GRU', 'CGH', 'VCP', 'CPQ', 'SAO'], // São Paulo
  ['GIG', 'SDU', 'RIO'], // Rio de Janeiro
  ['JFK', 'EWR', 'LGA', 'SWF', 'NYC'], // Nova York
  ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN', 'LON'], // Londres
  ['CDG', 'ORY', 'BVA', 'PAR'], // Paris
  ['CNF', 'PLU', 'BHZ'], // Belo Horizonte
  ['FCO', 'CIA', 'ROM'], // Roma
  ['EZE', 'AEP', 'BUE'], // Buenos Aires
  ['MXP', 'LIN', 'BGY', 'MIL'], // Milão
  ['ORD', 'MDW', 'CHI'], // Chicago
  ['IAD', 'DCA', 'BWI', 'WAS'], // Washington DC
];

function isSameCityOrMetro(
  arrLoc: string,
  arrCode: string,
  depLoc: string,
  depCode: string
): boolean {
  const codeA = (arrCode || '').trim().toUpperCase();
  const codeB = (depCode || '').trim().toUpperCase();
  if (codeA && codeB && codeA === codeB) return true;

  const locA = normalizeText(arrLoc);
  const locB = normalizeText(depLoc);
  if (locA && locB && (locA.includes(locB) || locB.includes(locA))) return true;

  if (codeA && codeB) {
    for (const group of METRO_AIRPORT_GROUPS) {
      if (group.includes(codeA) && group.includes(codeB)) {
        return true;
      }
    }
  }

  const apA = getAirportByCode(codeA || arrLoc);
  const apB = getAirportByCode(codeB || depLoc);
  if (apA && apB) {
    const cityA = normalizeText(apA.city);
    const cityB = normalizeText(apB.city);
    if (cityA && cityB && (cityA === cityB || cityA.includes(cityB) || cityB.includes(cityA))) {
      return true;
    }
  }

  return false;
}

export const tripTimelineHealthService = {
  /**
   * Avalia a saúde da timeline de uma viagem e retorna se há alertas.
   * Regra do negócio:
   * - Com alertas na timeline -> 'PLANNING' ("Em Planejamento")
   * - Sem alertas na timeline -> 'PLANNED' ("Planejada"), ou 'IN_PROGRESS'/'COMPLETED' conforme as datas.
   */
  async evaluateTripHealth(tripId: string): Promise<TripTimelineHealth> {
    const { rows: tripRows } = await query(
      `SELECT id, title, start_date, end_date, cities, destination_summary, status
       FROM trips
       WHERE id = $1 AND deleted_at IS NULL`,
      [tripId]
    );

    if (tripRows.length === 0) {
      throw new Error(`Viagem ${tripId} não encontrada`);
    }

    const trip = tripRows[0];
    const alerts: TripTimelineAlert[] = [];

    const tripStart = toIsoDateStr(trip.start_date);
    const tripEnd = toIsoDateStr(trip.end_date);

    // Se a viagem não possui datas de início e fim, está automaticamente em planejamento
    if (!tripStart || !tripEnd) {
      alerts.push({
        id: `no-dates-${tripId}`,
        type: 'NO_DATES',
        severity: 'warning',
        title: 'Datas da viagem não definidas',
        description: 'Defina as datas de início e término para consolidar o roteiro.',
      });

      return {
        tripId,
        hasAlerts: true,
        totalAlerts: alerts.length,
        status: trip.status === 'ARCHIVED' ? 'ARCHIVED' : 'PLANNING',
        alerts,
      };
    }

    // Buscar reservas de hotel
    const { rows: hotels } = await query(
      `SELECT id, hotel_name, check_in_date, check_out_date
       FROM hotel_reservations
       WHERE trip_id = $1`,
      [tripId]
    );

    // Buscar trechos de transporte
    const { rows: segments } = await query(
      `SELECT s.id, s.reservation_id, s.departure_location, s.departure_station_code,
              s.arrival_location, s.arrival_station_code, s.departure_date, s.departure_time,
              s.arrival_date, s.arrival_time, s.passenger_names
       FROM transport_segments s
       JOIN transport_reservations r ON s.reservation_id = r.id
       WHERE r.trip_id = $1
       ORDER BY s.departure_date ASC, s.departure_time ASC NULLS LAST`,
      [tripId]
    );

    // 1. Verificar reservas fora dos limites da viagem
    for (const h of hotels) {
      const inDate = toIsoDateStr(h.check_in_date);
      const outDate = toIsoDateStr(h.check_out_date);
      if (inDate && inDate < tripStart) {
        alerts.push({
          id: `out-hotel-before-${h.id}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Hospedagem antes do início da viagem',
          description: `A hospedagem "${h.hotel_name}" inicia em ${inDate}, antes de ${tripStart}.`,
          date: inDate,
        });
      }
      if (outDate && outDate > tripEnd) {
        alerts.push({
          id: `out-hotel-after-${h.id}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Hospedagem após o fim da viagem',
          description: `A hospedagem "${h.hotel_name}" termina em ${outDate}, após ${tripEnd}.`,
          date: outDate,
        });
      }
    }

    for (const s of segments) {
      const depDate = toIsoDateStr(s.departure_date);
      const arrDate = toIsoDateStr(s.arrival_date);
      if (depDate && depDate < tripStart) {
        alerts.push({
          id: `out-seg-before-${s.id}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Transporte antes do início da viagem',
          description: `O trecho ${s.departure_location} → ${s.arrival_location} parte em ${depDate}, antes de ${tripStart}.`,
          date: depDate,
        });
      }
      if (arrDate && arrDate > tripEnd) {
        alerts.push({
          id: `out-seg-after-${s.id}`,
          type: 'OUT_OF_BOUNDS',
          severity: 'warning',
          title: 'Transporte após o fim da viagem',
          description: `O trecho ${s.departure_location} → ${s.arrival_location} chega em ${arrDate}, após ${tripEnd}.`,
          date: arrDate,
        });
      }
    }

    // 2. Determinar origem e trecho final de retorno
    let origLoc: string | null = null;
    let origCode: string | null = null;
    let returnDateStr: string | null = null;

    if (segments.length > 0) {
      const firstSeg = segments[0];
      origLoc = firstSeg.departure_location ? firstSeg.departure_location.trim() : null;
      origCode = firstSeg.departure_station_code ? firstSeg.departure_station_code.trim().toUpperCase() : null;

      for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        const arrLoc = (s.arrival_location || '').toLowerCase();
        const arrCode = (s.arrival_station_code || '').toUpperCase();
        const isOrigin =
          (origCode && arrCode === origCode) ||
          (origLoc && (arrLoc.includes(origLoc.toLowerCase()) || origLoc.toLowerCase().includes(arrLoc)));
        if (isOrigin) {
          returnDateStr = toIsoDateStr(s.arrival_date);
          break;
        }
      }
    }

    // 3. Verificar descontinuidade de transporte (ROUTE_GAP)
    if (segments.length > 1) {
      // Agrupar por passageiro se houver, ou por reserva
      const chains = new Map<string, typeof segments>();

      for (const s of segments) {
        const paxes = Array.isArray(s.passenger_names)
          ? s.passenger_names
          : typeof s.passenger_names === 'string' && s.passenger_names
          ? [s.passenger_names]
          : [];

        if (paxes.length > 0) {
          for (const p of paxes) {
            const key = normalizeText(typeof p === 'string' ? p : p.name || 'default');
            if (!chains.has(key)) chains.set(key, []);
            chains.get(key)!.push(s);
          }
        } else {
          const key = s.reservation_id || 'default';
          if (!chains.has(key)) chains.set(key, []);
          chains.get(key)!.push(s);
        }
      }

      for (const chain of chains.values()) {
        const sorted = [...chain].sort((a, b) => {
          const da = (toIsoDateStr(a.departure_date) || '') + (a.departure_time || '00:00');
          const db = (toIsoDateStr(b.departure_date) || '') + (b.departure_time || '00:00');
          return da.localeCompare(db);
        });

        for (let i = 0; i < sorted.length - 1; i++) {
          const curr = sorted[i];
          const next = sorted[i + 1];

          const currArrLoc = (curr.arrival_location || '').trim();
          const currArrCode = (curr.arrival_station_code || '').trim().toUpperCase();
          const nextDepLoc = (next.departure_location || '').trim();
          const nextDepCode = (next.departure_station_code || '').trim().toUpperCase();

          const isArrOrigin =
            (origCode && currArrCode === origCode) ||
            (origLoc && currArrLoc.toLowerCase().includes(origLoc.toLowerCase()));

          if (isArrOrigin) {
            continue;
          }

          const sameCityOrMetro = isSameCityOrMetro(currArrLoc, currArrCode, nextDepLoc, nextDepCode);

          if (!sameCityOrMetro && currArrLoc && nextDepLoc) {
            const nextDepDate = toIsoDateStr(next.departure_date);
            alerts.push({
              id: `route-gap-${curr.id}-${next.id}`,
              type: 'ROUTE_GAP',
              severity: 'info',
              title: 'Descontinuidade de transporte entre trechos',
              description: `O trecho anterior desembarcou em "${currArrLoc}" (${currArrCode || 'aeroporto'}), mas o próximo trecho parte de "${nextDepLoc}" (${nextDepCode || 'aeroporto'}).`,
              date: nextDepDate,
            });
          }
        }
      }
    }

    // 4. Verificar cobertura diária de hotel e sobreposições (HOTEL_CONFLICT & NO_LODGING)
    const dates: string[] = [];
    let currDate = tripStart;
    let guard = 0;
    while (currDate <= tripEnd && guard < 366) {
      dates.push(currDate);
      currDate = addDays(currDate, 1);
      guard++;
    }

    for (let i = 0; i < dates.length; i++) {
      const dStr = dates[i];

      // Hotéis ativos nesta noite
      const activeHotels = hotels.filter((h) => {
        const inDate = toIsoDateStr(h.check_in_date);
        const outDate = toIsoDateStr(h.check_out_date);
        return inDate && outDate && dStr >= inDate && dStr < outDate;
      });

      // Sobreposição de hotéis
      if (activeHotels.length > 1) {
        // Verificar se são hotéis com nomes diferentes ou sobreposição conflitante
        const names = activeHotels.map((h) => h.hotel_name);
        alerts.push({
          id: `conflict-hotel-${dStr}`,
          type: 'HOTEL_CONFLICT',
          severity: 'error',
          title: 'Sobreposição de hospedagens',
          description: `Existem ${activeHotels.length} reservas para a noite de ${dStr}: ${names.join(', ')}.`,
          date: dStr,
        });
      }

      // Noite sem hospedagem
      const isNightWithinTrip = dStr < tripEnd;
      const isAlreadyBackAtHome = returnDateStr ? dStr >= returnDateStr : false;
      const hasOvernightTransport = segments.some((s) => {
        const depDate = toIsoDateStr(s.departure_date);
        const arrDate = toIsoDateStr(s.arrival_date);
        const isOvernight = arrDate && depDate ? arrDate > depDate : false;
        return isOvernight && depDate === dStr;
      });

      if (isNightWithinTrip && !isAlreadyBackAtHome && activeHotels.length === 0 && !hasOvernightTransport) {
        alerts.push({
          id: `no-hotel-${dStr}`,
          type: 'NO_LODGING',
          severity: 'warning',
          title: 'Sem hospedagem reservada',
          description: `Não encontramos reserva de hotel para a noite de ${dStr}.`,
          date: dStr,
        });
      }
    }

    const hasAlerts = alerts.length > 0;
    let resolvedStatus: TripStatus = trip.status;

    if (trip.status === 'ARCHIVED') {
      resolvedStatus = 'ARCHIVED';
    } else if (hasAlerts) {
      resolvedStatus = 'PLANNING';
    } else {
      // Sem alertas na timeline: avaliar datas temporais
      const todayStr = new Date().toISOString().slice(0, 10);
      if (tripEnd < todayStr) {
        resolvedStatus = 'COMPLETED';
      } else if (tripStart <= todayStr && tripEnd >= todayStr) {
        resolvedStatus = 'IN_PROGRESS';
      } else {
        resolvedStatus = 'PLANNED';
      }
    }

    return {
      tripId,
      hasAlerts,
      totalAlerts: alerts.length,
      status: resolvedStatus,
      alerts,
    };
  },

  /**
   * Sincroniza o status da viagem no banco de dados baseado na avaliação de alertas.
   */
  async syncTripStatus(tripId: string): Promise<TripTimelineHealth> {
    const health = await this.evaluateTripHealth(tripId);

    await query(
      `UPDATE trips
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status != $1`,
      [health.status, tripId]
    );

    return health;
  },

  /**
   * Sincroniza o status de todas as viagens ativas no banco de dados.
   */
  async syncAllTrips(): Promise<{ total: number; updated: number }> {
    const { rows: trips } = await query(
      `SELECT id FROM trips WHERE deleted_at IS NULL`
    );

    let updated = 0;
    for (const t of trips) {
      try {
        const prevStatusRes = await query(`SELECT status FROM trips WHERE id = $1`, [t.id]);
        const prevStatus = prevStatusRes.rows[0]?.status;

        const health = await this.syncTripStatus(t.id);
        if (health.status !== prevStatus) {
          updated++;
        }
      } catch (err: any) {
        logger.error(`Erro ao sincronizar status da viagem ${t.id}:`, { error: err.message });
      }
    }

    logger.info(`Sincronização de status das viagens concluída: ${updated}/${trips.length} atualizadas.`);
    return { total: trips.length, updated };
  },
};
