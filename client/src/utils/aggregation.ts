/**
 * Utilitários de agregação para voos, hotéis e itens de roteiro no cliente.
 * Consolida dados enviados por múltiplos viajantes com datas/horários coincidentes.
 */
import { TransportSegment, TransportReservation, HotelReservation, ItineraryItem, HotelCluster } from '../types/index.js';


export interface AggregatedPassenger {
  name: string;
  seat?: string | null;
  ticketNumber?: string | null;
  ticketName?: string | null;
  travelerId?: string | null;
}

/** Normaliza número de voo para comparação */
export function normalizeFlightNumber(num?: string | null): string {
  if (!num) return '';
  return String(num).replace(/[\s-]/g, '').toUpperCase().trim();
}

/** Normaliza texto geral para busca aproximada */
export function normalizeText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai lista de passageiros de passenger_names (JSONB ou array ou string) */
export function extractPassengers(val: any, fallbackNames: string[] = []): AggregatedPassenger[] {
  if (!val) {
    return fallbackNames.map((n) => ({ name: n }));
  }

  let parsed = val;
  if (typeof val === 'string') {
    try {
      parsed = JSON.parse(val);
    } catch {
      return val
        .split(/[,;\n]/)
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((name: string) => ({ name }));
    }
  }

  if (Array.isArray(parsed)) {
    const result: AggregatedPassenger[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) result.push({ name: trimmed });
      } else if (item && typeof item === 'object') {
        const name = (item.name || item.displayName || item.ticketName || '').trim();
        if (name) {
          result.push({
            name,
            seat: item.seat || null,
            ticketNumber: item.ticketNumber || null,
            ticketName: item.ticketName || null,
            travelerId: item.travelerId || null,
          });
        }
      }
    }
    if (result.length > 0) return result;
  }

  return fallbackNames.map((n) => ({ name: n }));
}

/** Verifica se dois trechos de transporte representam o mesmo voo */
export function areFlightsMatching(f1: TransportSegment, f2: TransportSegment): boolean {
  if (!f1 || !f2) return false;

  // Arrival-only (next-day landing) must NOT merge with a departure flight
  if (Boolean(f1.isArrivalOnly) !== Boolean(f2.isArrivalOnly)) return false;

  const d1 = f1.departure_date || f1.arrival_date;
  const d2 = f2.departure_date || f2.arrival_date;
  if (d1 && d2 && d1 !== d2) return false;

  const fn1 = normalizeFlightNumber(f1.identification_number);
  const fn2 = normalizeFlightNumber(f2.identification_number);

  if (fn1 && fn2 && fn1 === fn2) return true;

  const t1 = f1.departure_time ? f1.departure_time.slice(0, 5) : null;
  const t2 = f2.departure_time ? f2.departure_time.slice(0, 5) : null;

  if (t1 && t2 && t1 === t2) {
    const loc1 = normalizeText(f1.departure_station_code || f1.departure_location);
    const loc2 = normalizeText(f2.departure_station_code || f2.departure_location);
    if (loc1 && loc2 && (loc1.includes(loc2) || loc2.includes(loc1))) {
      return true;
    }
  }

  return false;
}

/** Agrega trechos de voo */
export function aggregateFlightSegments(
  segments: TransportSegment[],
  fallbackTravelers: string[] = []
): (TransportSegment & {
  passengersDetail: AggregatedPassenger[];
  passengerCount: number;
  aggregatedCount: number;
})[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const groups: TransportSegment[][] = [];

  for (const seg of segments) {
    let foundGroup = false;
    for (const group of groups) {
      if (areFlightsMatching(group[0], seg)) {
        group.push(seg);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      groups.push([seg]);
    }
  }

  return groups.map((group) => {
    const base = { ...group[0] };
    const allPax: AggregatedPassenger[] = [];
    const seenNames = new Set<string>();

    for (const seg of group) {
      const paxes = extractPassengers(seg.passenger_names, fallbackTravelers);
      if (paxes.length === 0 && seg.passengers && seg.passengers.length > 0) {
        for (const p of seg.passengers) {
          paxes.push({
            name: p.name,
            seat: p.seat || null,
            ticketNumber: p.ticketNumber || null,
            ticketName: p.ticketName || null,
          });
        }
      }

      for (const p of paxes) {
        const norm = normalizeText(p.name);
        if (!seenNames.has(norm)) {
          seenNames.add(norm);
          allPax.push(p);
        } else {
          const existing = allPax.find((ep) => normalizeText(ep.name) === norm);
          if (existing && !existing.seat && p.seat) {
            existing.seat = p.seat;
          }
        }
      }
    }

    const seats = group
      .map((s) => s.seat)
      .concat(allPax.map((p) => p.seat))
      .filter((s): s is string => Boolean(s && String(s).trim()))
      .filter((v, i, a) => a.indexOf(v) === i);

    const formattedPaxDetails = allPax
      .map((p) => (p.seat ? `${p.name} (Assento: ${p.seat})` : p.name))
      .join(', ');

    return {
      ...base,
      passenger_names: allPax,
      passengers: allPax,
      passengersDetail: allPax,
      passengersFormatted: formattedPaxDetails,
      passengerCount: allPax.length,
      seat: seats.join(', ') || base.seat || null,
      aggregatedCount: group.length,
    };
  });
}

function toIsoDateStr(d?: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/** Verifica se duas reservas de hotel representam a mesma hospedagem */
export function areHotelsMatching(h1: HotelReservation, h2: HotelReservation): boolean {
  if (!h1 || !h2) return false;

  const in1 = toIsoDateStr(h1.check_in_date);
  const in2 = toIsoDateStr(h2.check_in_date);
  const out1 = toIsoDateStr(h1.check_out_date || h1.check_in_date);
  const out2 = toIsoDateStr(h2.check_out_date || h2.check_in_date);

  // Duas reservas só representam a mesma hospedagem se forem para o mesmo período exato.
  // Períodos distintos ou estadas consecutivas (ex: 17->18 e 18->22) são estadas separadas.
  if (!in1 || !in2 || in1 !== in2 || out1 !== out2) return false;

  const n1 = normalizeText(h1.hotel_name);
  const n2 = normalizeText(h2.hotel_name);

  if (n1 && n2) {
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  }

  const a1 = normalizeText(h1.address);
  const a2 = normalizeText(h2.address);
  if (a1 && a2 && (a1.includes(a2) || a2.includes(a1))) return true;

  return false;
}

/** Agrega reservas de hotel */
export function aggregateHotels(hotels: HotelReservation[]): (HotelReservation & {
  guestCount: number;
  aggregatedCount: number;
})[] {
  if (!Array.isArray(hotels) || hotels.length === 0) return [];

  const groups: HotelReservation[][] = [];

  for (const h of hotels) {
    let found = false;
    for (const g of groups) {
      if (areHotelsMatching(g[0], h)) {
        g.push(h);
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push([h]);
    }
  }

  return groups.map((group) => {
    const base = { ...group[0] };
    const allGuests = new Set<string>();

    for (const h of group) {
      if (h.guest_names) {
        h.guest_names
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((g) => allGuests.add(g));
      }
    }

    const resNumbers = group
      .map((h) => h.reservation_number)
      .filter((n): n is string => Boolean(n && String(n).trim()))
      .filter((v, i, a) => a.indexOf(v) === i);

    const guestList = Array.from(allGuests);

    return {
      ...base,
      guest_names: guestList.join(', ') || base.guest_names || '',
      guestCount: Math.max(guestList.length, 1),
      reservation_number: resNumbers.join(', ') || base.reservation_number || '',
      aggregatedCount: group.length,
    };
  });
}


export function doDatesOverlap(in1: string, out1: string, in2: string, out2: string): boolean {
  if (!in1 || !in2) return false;
  const dIn1 = in1.slice(0, 10);
  const dOut1 = (out1 || dIn1).slice(0, 10);
  const dIn2 = in2.slice(0, 10);
  const dOut2 = (out2 || dIn2).slice(0, 10);

  if (dOut1 > dIn1 && dOut2 > dIn2) {
    return dIn1 < dOut2 && dIn2 < dOut1;
  }
  return dIn1 <= dOut2 && dIn2 <= dOut1;
}

export function parseGuestNames(raw?: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Agrupa reservas de hotéis em clusters de períodos de estadia.
 * Identifica se no mesmo período há opções concorrentes (mesmos viajantes em múltiplos hotéis)
 * ou grupo dividido (viajantes distintos em hotéis distintos).
 */
export function detectHotelClusters(
  hotels: (HotelReservation & {
    guestCount?: number;
    aggregatedCount?: number;
  })[]
): HotelCluster[] {
  if (!Array.isArray(hotels) || hotels.length === 0) return [];

  const sorted = [...hotels].sort((a, b) =>
    toIsoDateStr(a.check_in_date).localeCompare(toIsoDateStr(b.check_in_date))
  );

  const rawClusters: {
    startDate: string;
    endDate: string;
    city?: string | null;
    country?: string | null;
    hotels: (HotelReservation & {
      guestCount?: number;
      aggregatedCount?: number;
    })[];
  }[] = [];

  for (const h of sorted) {
    const inH = toIsoDateStr(h.check_in_date);
    const outH = toIsoDateStr(h.check_out_date) || inH;

    const matchingIndices: number[] = [];
    for (let i = 0; i < rawClusters.length; i++) {
      const c = rawClusters[i];
      if (doDatesOverlap(c.startDate, c.endDate, inH, outH)) {
        matchingIndices.push(i);
      }
    }

    if (matchingIndices.length === 0) {
      rawClusters.push({
        startDate: inH,
        endDate: outH,
        city: h.city || null,
        country: h.country || null,
        hotels: [h],
      });
    } else {
      const firstIdx = matchingIndices[0];
      const targetCluster = rawClusters[firstIdx];
      targetCluster.hotels.push(h);
      if (inH < targetCluster.startDate) targetCluster.startDate = inH;
      if (outH > targetCluster.endDate) targetCluster.endDate = outH;
      if (!targetCluster.city && h.city) targetCluster.city = h.city;
      if (!targetCluster.country && h.country) targetCluster.country = h.country;

      for (let i = matchingIndices.length - 1; i > 0; i--) {
        const otherIdx = matchingIndices[i];
        const other = rawClusters.splice(otherIdx, 1)[0];
        targetCluster.hotels.push(...other.hotels);
        if (other.startDate < targetCluster.startDate) targetCluster.startDate = other.startDate;
        if (other.endDate > targetCluster.endDate) targetCluster.endDate = other.endDate;
      }
    }
  }

  return rawClusters.map((c, idx) => {
    if (c.hotels.length <= 1) {
      return {
        ...c,
        id: `cluster-${c.startDate}-${c.endDate}-${idx}`,
        type: 'SINGLE',
        competingGuests: [],
        distinctGuestsByHotel: {},
      };
    }

    const guestHotelMap = new Map<string, { originalName: string; hotelIds: Set<string> }>();
    const distinctGuestsByHotel: Record<string, string[]> = {};

    for (const h of c.hotels) {
      const guests = parseGuestNames(h.guest_names);
      distinctGuestsByHotel[h.id] = guests;
      for (const g of guests) {
        const norm = normalizeText(g);
        if (!norm) continue;
        if (!guestHotelMap.has(norm)) {
          guestHotelMap.set(norm, { originalName: g, hotelIds: new Set() });
        }
        guestHotelMap.get(norm)!.hotelIds.add(h.id);
      }
    }

    const competingGuests: string[] = [];
    for (const [, data] of guestHotelMap.entries()) {
      if (data.hotelIds.size > 1) {
        competingGuests.push(data.originalName);
      }
    }

    const type = competingGuests.length > 0 ? 'CONCURRENT_OPTIONS' : 'SPLIT_GROUP';

    return {
      ...c,
      id: `cluster-${c.startDate}-${c.endDate}-${idx}`,
      type,
      competingGuests,
      distinctGuestsByHotel,
    };
  });
}

