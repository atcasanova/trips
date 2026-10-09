import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export interface TripDaySyncResult {
  daysAdded: number;
  daysReordered: number;
  segmentsLinked: number;
}

function toIsoDateStr(d: unknown): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function generateFlightDayTitle(dateStr: string, departures: any[], arrivals: any[]): { title: string; icon: string; base: string; subtitle: string } {
  const allCarriers = new Set<string>();
  const allFlightNums = new Set<string>();

  for (const seg of [...departures, ...arrivals]) {
    if (seg.carrier_name) allCarriers.add(seg.carrier_name);
    if (seg.identification_number) allFlightNums.add(seg.identification_number);
  }

  const carriersText = Array.from(allCarriers).join(' / ');
  const flightNumsText = Array.from(allFlightNums).join(', ');
  const subtitle = flightNumsText ? `${carriersText ? `${carriersText} • ` : ''}${flightNumsText}` : '';

  // Case 1: Departures only on this date (e.g. Day 1 initial departure)
  if (departures.length > 0 && arrivals.length === 0) {
    const first = departures[0];
    const last = departures[departures.length - 1];
    if (departures.length > 1) {
      return {
        title: `Embarque: ${first.departure_location} → ${first.arrival_location} → ${last.arrival_location}`,
        icon: '✈️',
        base: `${first.departure_location} / ${first.arrival_location}`,
        subtitle,
      };
    }
    return {
      title: `Voo: ${first.departure_location} → ${first.arrival_location}`,
      icon: '✈️',
      base: first.departure_location,
      subtitle,
    };
  }

  // Case 2: Arrivals only on this date (e.g. overnight flight landing)
  if (arrivals.length > 0 && departures.length === 0) {
    const arr = arrivals[arrivals.length - 1];
    return {
      title: `Chegada: ${arr.arrival_location} (${arr.arrival_station_code || 'Aeroporto'})`,
      icon: '🛬',
      base: arr.arrival_location,
      subtitle,
    };
  }

  // Case 3: Connection day with arrival in morning and departure later (or multiple flights)
  const firstArr = arrivals[0];
  const firstDep = departures[0];
  const lastDep = departures[departures.length - 1];

  if (firstArr && firstDep && firstArr.arrival_location === firstDep.departure_location) {
    return {
      title: `Conexão em ${firstArr.arrival_location} & Voo para ${lastDep.arrival_location}`,
      icon: '✈️',
      base: firstArr.arrival_location,
      subtitle,
    };
  }

  const startLoc = firstDep?.departure_location || firstArr?.arrival_location || 'Aeroporto';
  const endLoc = lastDep?.arrival_location || firstArr?.arrival_location || 'Destino';
  return {
    title: `Deslocamento: ${startLoc} → ${endLoc}`,
    icon: '✈️',
    base: startLoc,
    subtitle,
  };
}

export const tripDaySyncService = {
  /**
   * Automatically inspects flight segments and creates missing trip_days for any dates
   * with departures or arrivals, links segments to days, and re-sequences the itinerary.
   */
  async syncTripDaysFromTransports(tripId: string): Promise<TripDaySyncResult> {
    try {
      const { rows: segments } = await query(
        `SELECT
           id, departure_location, departure_station_code, departure_date, departure_time,
           arrival_location, arrival_station_code, arrival_date, arrival_time,
           carrier_name, identification_number, trip_day_id
         FROM transport_segments
         WHERE trip_id = $1
         ORDER BY departure_date ASC, departure_time ASC`,
        [tripId]
      );

      if (segments.length === 0) {
        return { daysAdded: 0, daysReordered: 0, segmentsLinked: 0 };
      }

      const { rows: existingDays } = await query(
        `SELECT id, day_number, date, title, base_location, order_index
         FROM trip_days
         WHERE trip_id = $1
         ORDER BY date ASC`,
        [tripId]
      );

      const existingDateMap = new Map<string, any>();
      for (const d of existingDays) {
        const ds = toIsoDateStr(d.date);
        if (ds) existingDateMap.set(ds, d);
      }

      // Group segments by flight dates
      const datesMap = new Map<string, { departures: any[]; arrivals: any[] }>();
      for (const seg of segments) {
        const depDate = toIsoDateStr(seg.departure_date || seg.departure_time);
        const arrDate = toIsoDateStr(seg.arrival_date || seg.arrival_time) || depDate;

        if (depDate) {
          if (!datesMap.has(depDate)) datesMap.set(depDate, { departures: [], arrivals: [] });
          datesMap.get(depDate)!.departures.push(seg);
        }
        if (arrDate && arrDate !== depDate) {
          if (!datesMap.has(arrDate)) datesMap.set(arrDate, { departures: [], arrivals: [] });
          datesMap.get(arrDate)!.arrivals.push(seg);
        }
      }

      let daysAdded = 0;
      for (const [dateStr, info] of Array.from(datesMap.entries()).sort()) {
        if (!existingDateMap.has(dateStr)) {
          const { title, icon, base, subtitle } = generateFlightDayTitle(dateStr, info.departures, info.arrivals);

          const { rows: newDayRows } = await query(
            `INSERT INTO trip_days (
               trip_id, date, day_number, title, subtitle, base_location, icon, order_index
             ) VALUES ($1, $2, 1, $3, $4, $5, $6, 0)
             RETURNING id, date`,
            [tripId, dateStr, title, subtitle || null, base || null, icon || '✈️']
          );

          if (newDayRows.length > 0) {
            daysAdded += 1;
            existingDateMap.set(dateStr, newDayRows[0]);
          }
        }
      }

      // Link segments to their respective trip_days
      let segmentsLinked = 0;
      for (const seg of segments) {
        const depDate = toIsoDateStr(seg.departure_date || seg.departure_time);
        const targetDay = depDate ? existingDateMap.get(depDate) : null;
        if (targetDay && targetDay.id && seg.trip_day_id !== targetDay.id) {
          await query(
            `UPDATE transport_segments SET trip_day_id = $1, updated_at = NOW() WHERE id = $2`,
            [targetDay.id, seg.id]
          );
          segmentsLinked += 1;
        }
      }

      // Re-sequence all days chronologically by date
      const { rows: allDays } = await query(
        `SELECT id, date, order_index
         FROM trip_days
         WHERE trip_id = $1
         ORDER BY date ASC, order_index ASC`,
        [tripId]
      );

      let daysReordered = 0;
      for (let i = 0; i < allDays.length; i++) {
        const day = allDays[i];
        const newDayNumber = i + 1;
        const newOrderIndex = i;
        await query(
          `UPDATE trip_days
           SET day_number = $1, order_index = $2, updated_at = NOW()
           WHERE id = $3`,
          [newDayNumber, newOrderIndex, day.id]
        );
        daysReordered += 1;
      }

      // Adjust trip start_date and end_date if new days extend boundaries
      if (allDays.length > 0) {
        const earliestDate = toIsoDateStr(allDays[0].date);
        const latestDate = toIsoDateStr(allDays[allDays.length - 1].date);
        await query(
          `UPDATE trips
           SET start_date = LEAST(start_date, $1::date),
               end_date = GREATEST(end_date, $2::date),
               updated_at = NOW()
           WHERE id = $3`,
          [earliestDate, latestDate, tripId]
        );
      }

      logger.info('Sincronização de dias com voos concluída', {
        tripId,
        daysAdded,
        daysReordered,
        segmentsLinked,
      });

      return { daysAdded, daysReordered, segmentsLinked };
    } catch (err: any) {
      logger.error('Erro ao sincronizar dias com voos:', { error: err.message, tripId });
      throw err;
    }
  },
};
