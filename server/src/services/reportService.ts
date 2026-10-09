import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import {
  aggregateFlightSegments,
  aggregateHotels,
  aggregateItineraryItems,
} from '../utils/aggregation.js';
import { getAirportByCode } from '../utils/airportLocations.js';

export const reportService = {
  // Compiles complete Trip Book data for a trip
  async getTripBookData(tripId: string) {
    // 1. Trip details
    const { rows: tripRows } = await query(
      `SELECT t.*, u.name as owner_name, u.email as owner_email
       FROM trips t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [tripId]
    );

    if (tripRows.length === 0) {
      throw new Error('Viagem não encontrada');
    }
    const trip = tripRows[0];

    // 2. Trip Days and Itinerary Items
    const { rows: days } = await query(
      `SELECT * FROM trip_days WHERE trip_id = $1 ORDER BY date ASC, order_index ASC`,
      [tripId]
    );

    const { rows: items } = await query(
      `SELECT i.*,
              COALESCE(i.document_id, doc.id) AS document_id,
              doc.original_name AS document_name,
              doc.mime_type AS document_mime_type,
              doc.file_size AS document_size
       FROM itinerary_items i
       LEFT JOIN documents doc ON doc.id = COALESCE(i.document_id, (substring(i.notes from '\\[DocID: ([0-9a-fA-F-]{36})\\]'))::uuid) AND doc.deleted_at IS NULL
       WHERE i.trip_id = $1
       ORDER BY i.order_index ASC, i.start_time ASC`,
      [tripId]
    );

    // Query all attached documents from itinerary_item_documents
    const { rows: docLinks } = await query(
      `SELECT iid.itinerary_item_id, doc.id, doc.original_name, doc.mime_type, doc.file_size
       FROM itinerary_item_documents iid
       JOIN documents doc ON doc.id = iid.document_id
       WHERE doc.trip_id = $1 AND doc.deleted_at IS NULL`,
      [tripId]
    );

    const docsByItem: Record<string, any[]> = {};
    for (const dl of docLinks) {
      if (!docsByItem[dl.itinerary_item_id]) docsByItem[dl.itinerary_item_id] = [];
      docsByItem[dl.itinerary_item_id].push({
        id: dl.id,
        document_id: dl.id,
        original_name: dl.original_name,
        mime_type: dl.mime_type,
        file_size: dl.file_size,
      });
    }

    // Group items by trip_day_id
    const itemsByDay: Record<string, any[]> = {};
    for (const item of items) {
      const itemDocs = docsByItem[item.id] || [];
      if (itemDocs.length === 0 && (item.document_id || item.document_name)) {
        itemDocs.push({
          id: item.document_id,
          document_id: item.document_id,
          original_name: item.document_name || 'Arquivo',
          mime_type: item.document_mime_type,
          file_size: item.document_size,
        });
      }
      item.documents = itemDocs;

      if (!itemsByDay[item.trip_day_id]) itemsByDay[item.trip_day_id] = [];
      itemsByDay[item.trip_day_id].push(item);
    }

    const fullDays = days.map(d => ({
      ...d,
      items: itemsByDay[d.id] || [],
    }));

    // 3. Transport reservations & segments
    const { rows: transportRes } = await query(
      `SELECT * FROM transport_reservations WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId]
    );

    const { rows: segments } = await query(
      `SELECT * FROM transport_segments WHERE trip_id = $1 ORDER BY departure_date ASC, departure_time ASC`,
      [tripId]
    );

    const segmentsByRes: Record<string, any[]> = {};
    for (const s of segments) {
      if (!segmentsByRes[s.reservation_id]) segmentsByRes[s.reservation_id] = [];
      segmentsByRes[s.reservation_id].push(s);
    }

    const fullTransports = transportRes.map(tr => ({
      ...tr,
      segments: segmentsByRes[tr.id] || [],
    }));

    // 4. Hotel reservations
    const { rows: hotels } = await query(
      `SELECT h.*,
              doc.original_name AS document_name,
              doc.mime_type AS document_mime_type,
              doc.file_size AS document_size
       FROM hotel_reservations h
       LEFT JOIN documents doc ON doc.id = h.document_id AND doc.deleted_at IS NULL
       WHERE h.trip_id = $1
       ORDER BY h.check_in_date ASC, h.created_at ASC`,
      [tripId]
    );

    // 5. Climate packing guides
    const { rows: climateGuides } = await query(
      `SELECT * FROM climate_packing_guides WHERE trip_id = $1 ORDER BY order_index ASC`,
      [tripId]
    );

    // 6. Checklist items
    const { rows: checklists } = await query(
      `SELECT * FROM checklist_items WHERE trip_id = $1 ORDER BY order_index ASC`,
      [tripId]
    );

    // 7. Expenses
    const { rows: expenses } = await query(
      `SELECT * FROM expenses WHERE trip_id = $1 ORDER BY date ASC`,
      [tripId]
    );

    // 8. Participants
    const { rows: members } = await query(
      `SELECT tm.*, u.name, u.email, u.avatar_url
       FROM trip_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.trip_id = $1`,
      [tripId]
    );

    // 9. Travelers / Companions
    const { rows: travelers } = await query(
      `SELECT * FROM trip_travelers WHERE trip_id = $1 ORDER BY created_at ASC`,
      [tripId]
    );

    return {
      trip,
      days: fullDays,
      transports: fullTransports,
      segments,
      hotels,
      climateGuides,
      checklists,
      expenses,
      members,
      travelers,
    };
  },

  // Generates standalone, editorial HTML ready for print & PDF
  generateTripBookHtml(
    data: any,
    options: {
      anonymize?: boolean;
      isPublicShare?: boolean;
      pdfDownloadUrl?: string;
      sections?: {
        cover?: boolean;
        overview?: boolean;
        calendar?: boolean;
        climatePacking?: boolean;
        dayByDay?: boolean;
        transports?: boolean;
        hotels?: boolean;
        checklist?: boolean;
      };
    } = {}
  ): string {
    const { trip, days, transports, segments, hotels, climateGuides, checklists, expenses, members, travelers = [] } = data;
    const theme = trip.theme || {
      preset: 'sakura',
      primary: '#b94a5d',
      secondary: '#d989a4',
      accent: '#fdf2f4',
      text: '#2f3941',
    };

    const sec = {
      cover: options.sections?.cover !== false,
      overview: options.sections?.overview !== false,
      calendar: options.sections?.calendar !== false,
      climatePacking: options.sections?.climatePacking !== false,
      dayByDay: options.sections?.dayByDay !== false,
      transports: options.sections?.transports !== false,
      hotels: options.sections?.hotels !== false,
      checklist: options.sections?.checklist !== false,
    };

    const toFiniteCoord = (val: any): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) return null;
      return num;
    };

    const citiesList = Array.isArray(trip.cities) ? trip.cities.join(' • ') : (trip.destination_summary || '');

    // Escape HTML strings for safety
    const escapeHtml = (str?: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Normalize date to YYYY-MM-DD string
    const toDateStr = (d: any): string => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().slice(0, 10);
      const s = String(d).trim();
      if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      return s;
    };

    // Add days in UTC
    const addDays = (dateStr: string, n: number): string => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + n));
      return dt.toISOString().slice(0, 10);
    };

    // Detailed date info
    const parseDateInfo = (dInput: any) => {
      const dStr = toDateStr(dInput);
      if (!dStr) return null;
      const [y, m, d] = dStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dow = dt.getUTCDay();
      const shortDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
      const mm = m < 10 ? '0' + m : m;
      const dd = d < 10 ? '0' + d : d;
      return {
        year: y,
        month: m,
        day: d,
        dayOfWeek: dow,
        weekdayShort: shortDays[dow],
        formattedShort: `${d}/${m}`,
        formattedBr: `${dd}/${mm}/${y}`,
        formattedWeekday: `${dd}/${mm} (${shortDays[dow]})`,
        dateStr: dStr,
      };
    };

    // Format dates in Portuguese
    const formatDateBr = (dStr?: string) => {
      const info = parseDateInfo(dStr);
      return info ? info.formattedBr : '';
    };

    const formatDateShort = (dStr?: string) => {
      const info = parseDateInfo(dStr);
      return info ? info.formattedShort : '';
    };

    // Extract passenger names from segment passenger_names or fallback
    const extractPassengerNames = (val: any): string[] => {
      if (options?.anonymize) {
        return ['Viajante(s)'];
      }
      if (!val || (Array.isArray(val) && val.length === 0)) {
        if (travelers && travelers.length > 0) return travelers.map((t: any) => t.display_name);
        return [];
      }
      let parsed = val;
      if (typeof val === 'string') {
        try { parsed = JSON.parse(val); } catch { return [val]; }
      }
      if (Array.isArray(parsed)) {
        const names = parsed.map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && p.name) return p.name;
          return String(p);
        }).filter(Boolean);
        if (names.length > 0) return names;
      }
      if (travelers && travelers.length > 0) return travelers.map((t: any) => t.display_name);
      return [];
    };

    interface PassengerDetail {
      name: string;
      seat?: string | null;
      bookingCode?: string | null;
      ticketNumber?: string | null;
    }

    // Extract detailed passengers with seats and booking codes
    const extractPassengerDetails = (
      val: any,
      defaultSeat?: string | null,
      defaultBookingCode?: string | null
    ): PassengerDetail[] => {
      if (options?.anonymize) {
        return [{ name: 'Viajante(s)' }];
      }
      if (!val || (Array.isArray(val) && val.length === 0)) {
        if (travelers && travelers.length > 0) {
          return travelers.map((t: any) => ({
            name: t.display_name || t.name,
            seat: defaultSeat || null,
            bookingCode: defaultBookingCode || null,
          }));
        }
        return [];
      }
      let parsed = val;
      if (typeof val === 'string') {
        try {
          parsed = JSON.parse(val);
        } catch {
          return [{ name: val, seat: defaultSeat || null, bookingCode: defaultBookingCode || null }];
        }
      }
      if (Array.isArray(parsed)) {
        const list: PassengerDetail[] = [];
        for (const p of parsed) {
          if (!p) continue;
          if (typeof p === 'string') {
            list.push({
              name: p,
              seat: defaultSeat || null,
              bookingCode: defaultBookingCode || null,
            });
          } else if (typeof p === 'object') {
            const name = p.name || p.displayName || p.ticketName;
            if (!name) continue;
            list.push({
              name,
              seat: p.seat || defaultSeat || null,
              bookingCode: p.bookingCode || p.booking_code || defaultBookingCode || null,
              ticketNumber: p.ticketNumber || p.ticket_number || null,
            });
          }
        }
        if (list.length > 0) return list;
      }
      if (travelers && travelers.length > 0) {
        return travelers.map((t: any) => ({
          name: t.display_name || t.name,
          seat: defaultSeat || null,
          bookingCode: defaultBookingCode || null,
        }));
      }
      return [];
    };

    // Index days by dateStr
    const daysByDate: Record<string, any> = {};
    for (const d of days) {
      const ds = toDateStr(d.date);
      if (ds) {
        daysByDate[ds] = {
          ...d,
          dateStr: ds,
        };
      }
    }

    // Index flight segments by departure and arrival date
    const rawSegmentsByDate: Record<string, any[]> = {};
    const allSegments = segments || [];
    for (const s of allSegments) {
      const depDate = toDateStr(s.departure_date);
      const arrDate = toDateStr(s.arrival_date);
      const pax = extractPassengerNames(s.passenger_names);
      const isOvernight = Boolean(depDate && arrDate && arrDate > depDate);
      const segWithPax = {
        ...s,
        passengerNames: pax,
        seat: options?.anonymize ? '' : s.seat,
        isOvernight,
      };

      if (depDate) {
        if (!rawSegmentsByDate[depDate]) rawSegmentsByDate[depDate] = [];
        rawSegmentsByDate[depDate].push({ ...segWithPax, isArrivalOnly: false });
      }
      if (arrDate && arrDate !== depDate) {
        if (!rawSegmentsByDate[arrDate]) rawSegmentsByDate[arrDate] = [];
        rawSegmentsByDate[arrDate].push({ ...segWithPax, isArrivalOnly: true, isOvernight: false });
      }
    }

    // Determine trip origin and return date
    let originLocation: string | null = null;
    let originStationCode: string | null = null;
    let returnSegment: any = null;
    let returnDateStr: string | null = null;

    if (allSegments.length > 0) {
      const sortedSegs = [...allSegments].sort((a, b) => {
        const da = (toDateStr(a.departure_date) || '') + (a.departure_time || '00:00');
        const db = (toDateStr(b.departure_date) || '') + (b.departure_time || '00:00');
        return da.localeCompare(db);
      });

      const firstSeg = sortedSegs[0];
      originLocation = firstSeg.departure_location?.trim() || null;
      originStationCode = firstSeg.departure_station_code?.trim()?.toUpperCase() || null;

      for (let i = sortedSegs.length - 1; i >= 0; i--) {
        const s = sortedSegs[i];
        const arrLoc = (s.arrival_location || '').toLowerCase();
        const arrCode = (s.arrival_station_code || '').toUpperCase();
        const isOrigin =
          (originStationCode && arrCode === originStationCode) ||
          (originLocation && (arrLoc.includes(originLocation.toLowerCase()) || originLocation.toLowerCase().includes(arrLoc)));
        if (isOrigin) {
          returnSegment = s;
          break;
        }
      }
      returnDateStr = returnSegment ? toDateStr(returnSegment.arrival_date) : null;
    }

    const segmentsByDate: Record<string, any[]> = {};
    const fallbackPax = travelers && travelers.length > 0 ? travelers.map((t: any) => t.display_name) : [];
    for (const [dt, segList] of Object.entries(rawSegmentsByDate)) {
      segmentsByDate[dt] = aggregateFlightSegments(segList, {
        anonymize: options?.anonymize,
        fallbackTravelers: fallbackPax,
      });
    }

    // Index hotels by active stay dates
    // Night of lodging is from check_in_date up to (but not including) check_out_date.
    // If check_out is not specified or equal to check_in, it's considered for that single date.
    const rawStayHotelsByDate: Record<string, any[]> = {};
    const rawCheckInHotelsByDate: Record<string, any[]> = {};
    const rawCheckOutHotelsByDate: Record<string, any[]> = {};
    const allHotels = hotels || [];

    for (const h of allHotels) {
      const inDate = toDateStr(h.check_in_date);
      const outDate = toDateStr(h.check_out_date);
      if (inDate) {
        if (!rawCheckInHotelsByDate[inDate]) rawCheckInHotelsByDate[inDate] = [];
        rawCheckInHotelsByDate[inDate].push(h);

        if (outDate && outDate > inDate) {
          if (!rawCheckOutHotelsByDate[outDate]) rawCheckOutHotelsByDate[outDate] = [];
          rawCheckOutHotelsByDate[outDate].push(h);
        }

        let cur = inDate;
        let count = 0;
        const isSingleDay = !outDate || outDate === inDate;
        while (count < 60) {
          if (isSingleDay) {
            if (!rawStayHotelsByDate[cur]) rawStayHotelsByDate[cur] = [];
            rawStayHotelsByDate[cur].push(h);
            break;
          }
          if (cur >= outDate) break;
          if (!rawStayHotelsByDate[cur]) rawStayHotelsByDate[cur] = [];
          rawStayHotelsByDate[cur].push(h);
          cur = addDays(cur, 1);
          count++;
        }
      }
    }

    const stayHotelsByDate: Record<string, any[]> = {};
    const hotelsByDate: Record<string, any> = {};
    for (const [dt, hList] of Object.entries(rawStayHotelsByDate)) {
      const aggHotels = aggregateHotels(hList, { anonymize: options?.anonymize });
      stayHotelsByDate[dt] = aggHotels;
      hotelsByDate[dt] = aggHotels[0] || null;
    }

    const checkInHotelsByDate: Record<string, any[]> = {};
    for (const [dt, hList] of Object.entries(rawCheckInHotelsByDate)) {
      checkInHotelsByDate[dt] = aggregateHotels(hList, { anonymize: options?.anonymize });
    }

    const checkOutHotelsByDate: Record<string, any[]> = {};
    for (const [dt, hList] of Object.entries(rawCheckOutHotelsByDate)) {
      checkOutHotelsByDate[dt] = aggregateHotels(hList, { anonymize: options?.anonymize });
    }

    // Build Day Mini-Maps data (attractions, active lodging, and travel airports)
    let stopCounter = 0;
    const dayMapsData: Record<string, Array<{
      number?: number;
      title: string;
      subtitle?: string;
      latitude: number;
      longitude: number;
      pointType: 'ACTIVITY' | 'HOTEL' | 'AIRPORT';
    }>> = {};

    const allTripTravelerNames = new Set(
      travelers.map((t: any) => (t.display_name || t.name || '').trim().toLowerCase()).filter(Boolean)
    );

    const getDistKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    for (const d of (days || [])) {
      const validPoints: Array<{
        number?: number;
        title: string;
        subtitle?: string;
        latitude: number;
        longitude: number;
        pointType: 'ACTIVITY' | 'HOTEL' | 'AIRPORT';
      }> = [];

      // 1. Activities / Stops
      for (const item of (d.items || [])) {
        if (item.map_mode === 'SKIP') continue;
        const lat = toFiniteCoord(item.latitude);
        const lng = toFiniteCoord(item.longitude);
        if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
          continue;
        }
        stopCounter += 1;
        validPoints.push({
          number: stopCounter,
          title: String(item.title || 'Atração'),
          latitude: lat,
          longitude: lng,
          pointType: 'ACTIVITY',
        });
      }

      const dayDateStr = toDateStr(d.date);

      // 2. Day Hotels (Active lodging for tonight; checkout hotels excluded to prevent zooming out to distant previous cities)
      const dayHotelsForMap = stayHotelsByDate[dayDateStr] || [];
      for (const h of dayHotelsForMap) {
        const lat = toFiniteCoord(h.latitude);
        const lng = toFiniteCoord(h.longitude);
        if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && (lat !== 0 || lng !== 0)) {
          const inD = toDateStr(h.check_in_date);
          const isCheckInToday = inD === dayDateStr;
          validPoints.push({
            title: h.hotel_name,
            subtitle: `${h.city ? `${h.city} • ` : ''}${isCheckInToday ? 'Check-in hoje' : 'Hospedagem'}`,
            latitude: lat,
            longitude: lng,
            pointType: 'HOTEL',
          });
        }
      }

      // 3. Day Airports (Only for actual travel days, excluding early partial departures)
      if (dayDateStr) {
        const actPoints = validPoints.filter(p => p.pointType === 'ACTIVITY');
        const hasDayActivities = actPoints.length > 0;
        const avgActLat = hasDayActivities ? actPoints.reduce((s, p) => s + p.latitude, 0) / actPoints.length : null;
        const avgActLng = hasDayActivities ? actPoints.reduce((s, p) => s + p.longitude, 0) / actPoints.length : null;

        const dayAirportMap = new Map<string, any>();
        for (const seg of allSegments) {
          const depDate = toDateStr(seg.departure_date);
          const arrDate = toDateStr(seg.arrival_date) || depDate;
          const isExplicitDay = seg.trip_day_id === d.id;

          const segTravelers = (seg.passenger_names || [])
            .map((p: any) => (typeof p?.name === 'string' ? p.name.trim().toLowerCase() : ''))
            .filter(Boolean);
          const isPartialGroup = allTripTravelerNames.size > 1 && segTravelers.length > 0 && segTravelers.length < allTripTravelerNames.size;
          const isBeforeTripEnd = returnDateStr ? (depDate || '') < returnDateStr : false;
          const isEarlyDeparture = isPartialGroup && isBeforeTripEnd && (hasDayActivities || d.day_number < (days.length - 2));

          if (isEarlyDeparture) continue;

          if (depDate === dayDateStr || isExplicitDay) {
            const ap = getAirportByCode(seg.departure_station_code || seg.departure_location);
            if (ap && !dayAirportMap.has(ap.code)) {
              const isFar = hasDayActivities && avgActLat !== null && avgActLng !== null
                ? getDistKm(avgActLat, avgActLng, ap.latitude, ap.longitude) > 800
                : false;
              if (!isFar) {
                dayAirportMap.set(ap.code, {
                  title: ap.name,
                  subtitle: `${ap.city} • Embarque`,
                  latitude: ap.latitude,
                  longitude: ap.longitude,
                  pointType: 'AIRPORT',
                });
              }
            }
          }

          if (arrDate === dayDateStr || isExplicitDay) {
            const ap = getAirportByCode(seg.arrival_station_code || seg.arrival_location);
            if (ap && !dayAirportMap.has(ap.code)) {
              const isFar = hasDayActivities && avgActLat !== null && avgActLng !== null
                ? getDistKm(avgActLat, avgActLng, ap.latitude, ap.longitude) > 800
                : false;
              if (!isFar) {
                dayAirportMap.set(ap.code, {
                  title: ap.name,
                  subtitle: `${ap.city} • Desembarque`,
                  latitude: ap.latitude,
                  longitude: ap.longitude,
                  pointType: 'AIRPORT',
                });
              }
            }
          }
        }
        for (const apPoint of dayAirportMap.values()) {
          validPoints.push(apPoint);
        }
      }

      if (validPoints.length > 0) {
        dayMapsData[d.day_number] = validPoints;
      }
    }

    // Determine timeline date range
    const dateCandidates: string[] = [];
    const tripStartStr = toDateStr(trip.start_date);
    const tripEndStr = toDateStr(trip.end_date);
    if (tripStartStr) dateCandidates.push(tripStartStr);
    if (tripEndStr) dateCandidates.push(tripEndStr);
    for (const d of days) {
      const ds = toDateStr(d.date);
      if (ds) dateCandidates.push(ds);
    }
    for (const s of allSegments) {
      const dep = toDateStr(s.departure_date);
      const arr = toDateStr(s.arrival_date);
      if (dep) dateCandidates.push(dep);
      if (arr) dateCandidates.push(arr);
    }

    dateCandidates.sort();
    const minDateStr = dateCandidates.length > 0 ? dateCandidates[0] : tripStartStr;
    const maxDateStr = dateCandidates.length > 0 ? dateCandidates[dateCandidates.length - 1] : tripEndStr;

    // Build unified timeline array for all trip days
    const timelineDays: any[] = [];
    if (minDateStr && maxDateStr && minDateStr <= maxDateStr) {
      let cur = minDateStr;
      let count = 0;
      while (cur <= maxDateStr && count < 100) {
        const dInfo = parseDateInfo(cur)!;
        const dayRecord = daysByDate[cur];
        const dayFlights = segmentsByDate[cur] || [];
        const dayHotel = hotelsByDate[cur];

        const isReturnDay = Boolean(returnDateStr && cur === returnDateStr);
        const isPostReturnDay = Boolean(returnDateStr && cur > returnDateStr);

        let baseLocation = dayRecord?.base_location;
        let title = dayRecord?.title;
        let icon = dayRecord?.icon;
        let anchorId = dayRecord ? `dia-${dayRecord.day_number}` : (dayFlights.length > 0 ? 'transportes' : `data-${cur}`);

        if (isReturnDay) {
          baseLocation = baseLocation || originLocation || 'Brasília';
          title = title || 'Retorno ao Brasil';
          icon = icon || '🏠';
        } else if (isPostReturnDay) {
          baseLocation = baseLocation || originLocation || 'Brasília';
          title = title || 'Em Casa / Retorno Concluído';
          icon = icon || '🏠';
        } else if (!dayRecord && dayFlights.length > 0) {
          const nonLayoverArrivals = dayFlights.filter((f) => f.isArrivalOnly);
          if (nonLayoverArrivals.length > 0) {
            const lastArr = nonLayoverArrivals[nonLayoverArrivals.length - 1];
            baseLocation = lastArr.arrival_location || 'Destino';
            title = `Chegada a ${baseLocation}`;
            icon = '🛬';
          } else if (cur === minDateStr) {
            baseLocation = 'Em Voo (Brasil → Destino)';
            title = 'Saída do Brasil / Início da Viagem';
            icon = '✈️';
          } else {
            baseLocation = 'Em Trânsito Internacional';
            title = 'Voo Internacional em Trânsito';
            icon = '✈️';
          }
        }

        const rawDayItems = dayRecord?.items || [];
        const aggregatedDayItems = aggregateItineraryItems(rawDayItems, { anonymize: options?.anonymize });

        timelineDays.push({
          dateStr: cur,
          dateInfo: dInfo,
          dayRecord,
          dayNumber: dayRecord?.day_number,
          title: title || (dayRecord?.subtitle) || 'Dia de Viagem',
          subtitle: dayRecord?.subtitle,
          baseLocation: baseLocation || 'Em Trânsito',
          icon: icon || '📍',
          items: aggregatedDayItems,
          flights: dayFlights,
          hotel: dayHotel,
          hotels: stayHotelsByDate[cur] || [],
          checkOutHotels: checkOutHotelsByDate[cur] || [],
          anchorId,
          hasDetailedCard: !!dayRecord,
          isReturnDay,
          isPostReturnDay,
        });

        cur = addDays(cur, 1);
        count++;
      }
    }

    // Group timeline days into months for Calendar Grid
    const monthsMap: Record<string, { year: number; month: number; days: any[] }> = {};
    for (const tDay of timelineDays) {
      const ym = `${tDay.dateInfo.year}-${tDay.dateInfo.month < 10 ? '0' + tDay.dateInfo.month : tDay.dateInfo.month}`;
      if (!monthsMap[ym]) {
        monthsMap[ym] = {
          year: tDay.dateInfo.year,
          month: tDay.dateInfo.month,
          days: [],
        };
      }
      monthsMap[ym].days.push(tDay);
    }

    const monthNamesPt = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    // Calendar grid generator
    const renderMonthGrid = (mKey: string, mData: { year: number; month: number; days: any[] }) => {
      const { year, month } = mData;
      const monthName = monthNamesPt[month - 1];
      const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      const totalDaysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

      const daysLookup: Record<number, any> = {};
      for (const td of mData.days) {
        daysLookup[td.dateInfo.day] = td;
      }

      const weeks: (any | null)[][] = [];
      let currentWeek: (any | null)[] = [];

      for (let i = 0; i < firstDow; i++) {
        currentWeek.push(null);
      }

      for (let d = 1; d <= totalDaysInMonth; d++) {
        currentWeek.push({
          dayNum: d,
          data: daysLookup[d] || null,
        });
        if (currentWeek.length === 7) {
          weeks.push(currentWeek);
          currentWeek = [];
        }
      }

      if (currentWeek.length > 0) {
        while (currentWeek.length < 7) {
          currentWeek.push(null);
        }
        weeks.push(currentWeek);
      }

      return `
        <div class="cal-month-wrap">
          <div class="cal-month-header">🌸 ${monthName} ${year}</div>
          <table class="cal-grid-table">
            <thead>
              <tr>
                <th style="width: 14.28%;">DOM</th>
                <th style="width: 14.28%;">SEG</th>
                <th style="width: 14.28%;">TER</th>
                <th style="width: 14.28%;">QUA</th>
                <th style="width: 14.28%;">QUI</th>
                <th style="width: 14.28%;">SEX</th>
                <th style="width: 14.28%;">SÁB</th>
              </tr>
            </thead>
            <tbody>
              ${weeks.map(week => `
                <tr>
                  ${week.map(cell => {
                    if (!cell) {
                      return `
                        <td>
                          <div class="cal-day-cell cal-day-muted cal-day-empty">&nbsp;</div>
                        </td>
                      `;
                    }
                    const tDay = cell.data;
                    if (!tDay) {
                      return `
                        <td>
                          <div class="cal-day-cell cal-day-muted">
                            <div class="cal-day-header"><span class="cal-day-num">${cell.dayNum}</span></div>
                          </div>
                        </td>
                      `;
                    }

                    return `
                      <td>
                        <a href="#${tDay.anchorId}" class="cal-day-cell cal-day-active" title="Ver detalhes: ${escapeHtml(tDay.title)}">
                          <div class="cal-day-header">
                            <span class="cal-day-num">${cell.dayNum}</span>
                            ${tDay.dayNumber ? `<span class="cal-day-badge">Dia ${tDay.dayNumber}</span>` : (tDay.isReturnDay ? `<span class="cal-day-badge cal-badge-return">🏠 Retorno</span>` : (tDay.isPostReturnDay ? `<span class="cal-day-badge cal-badge-home">🏠 Em Casa</span>` : (tDay.flights && tDay.flights.length > 0 ? `<span class="cal-day-badge">✈️ Voo</span>` : '')))}
                          </div>
                          <div class="cal-day-base">
                            <span>${tDay.icon || '📍'}</span>
                            <span>${escapeHtml(tDay.baseLocation)}</span>
                          </div>
                          <div class="cal-day-title">${escapeHtml(tDay.title)}</div>
                          ${tDay.flights && tDay.flights.length > 0 ? tDay.flights.map((f: any) => {
                            const paxLabel = f.passengersFormatted || (f.passengerNames && f.passengerNames.length > 0 ? f.passengerNames.join(', ') : '');
                            const paxCount = f.passengerCount || (f.passengerNames ? f.passengerNames.length : 1);
                            const paxBadge = paxCount > 1
                              ? (options?.anonymize ? `${paxCount} pessoas` : `${paxCount} pessoas: ${paxLabel}`)
                              : paxLabel;
                            const isArrival = Boolean(f.isArrivalOnly);
                            const isOvernight = Boolean(f.isOvernight);

                            if (isArrival) {
                              return `
                                <div class="cal-day-flight cal-day-flight-arrival" title="Pouso / Desembarque no dia seguinte">
                                  🛬 <strong>Pouso: ${escapeHtml(f.identification_number || f.carrier_name || 'Voo')}</strong>
                                  ${f.arrival_time ? `<span style="font-size: 5.8pt; color: #64748b;"> (${escapeHtml(f.arrival_time.slice(0, 5))})</span>` : ''}
                                  ${paxBadge ? `<span class="cal-day-flight-pax">👤 ${escapeHtml(paxBadge)}</span>` : ''}
                                </div>
                              `;
                            }

                            return `
                              <div class="cal-day-flight" title="Embarque / Voo">
                                🛫 <strong>${escapeHtml(f.identification_number || f.carrier_name || 'Voo')}</strong>
                                ${isOvernight ? `<span style="font-size: 5.8pt; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 0 2px; border-radius: 2px;">+1d</span>` : ''}
                                ${paxBadge ? `<span class="cal-day-flight-pax">👤 ${escapeHtml(paxBadge)}</span>` : ''}
                              </div>
                            `;
                          }).join('') : ''}
                          ${tDay.hotel ? `
                            <div class="cal-day-hotel" style="font-size: 6.5pt; color: #047857; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Hospedagem: ${escapeHtml(tDay.hotel.hotel_name)}">
                              🏨 <strong>${escapeHtml(tDay.hotel.hotel_name)}</strong>
                              ${!options?.anonymize && tDay.hotel.guest_names ? `<span style="color: #065f46; font-size: 6pt;"> • ${escapeHtml(tDay.hotel.guest_names)}</span>` : (tDay.hotel.guestCount > 1 ? `<span style="color: #065f46; font-size: 6pt;"> (${tDay.hotel.guestCount} hóspedes)</span>` : '')}
                            </div>
                          ` : ''}
                          ${(tDay.items || []).filter((it: any) => it.category === 'EVENT' || it.document_id || (it.documents && it.documents.length > 0)).slice(0, 2).map((it: any) => {
                            const attLabel = it.attendees && it.attendees.length > 1
                              ? (options?.anonymize ? ` (${it.attendees.length} pessoas)` : ` (${it.attendees.join(', ')})`)
                              : '';
                            return `
                              <div class="cal-day-event" style="font-size: 6.5pt; color: #7c2d12; background: #fff7ed; border-radius: 3px; padding: 1px 3px; margin-top: 2px; border: 1px solid #ffedd5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(it.title)}">
                                🎟️ <strong>${escapeHtml(it.title)}</strong>${escapeHtml(attLabel)}
                              </div>
                            `;
                          }).join('')}
                        </a>
                      </td>
                    `;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    // Google Calendar style agenda table generator
    const renderAgendaTable = () => {
      return `
        <div class="table-responsive">
        <table class="agenda-table">
          <thead>
            <tr>
              <th style="width: 14%;">Dia / Data</th>
              <th style="width: 15%;">Base / Local</th>
              <th style="width: 25%;">Voos & Deslocamentos</th>
              <th style="width: 32%;">Agenda do Dia — Primeiros Compromissos</th>
              <th style="width: 14%;">Pernoite / Hotel</th>
            </tr>
          </thead>
          <tbody>
            ${timelineDays.map(tDay => {
              // 1. Flights HTML with passengers
              let flightsHtml = '<span style="color: #94a3b8;">—</span>';
              if (tDay.flights && tDay.flights.length > 0) {
                flightsHtml = tDay.flights.map((f: any) => {
                  const paxLabel = f.passengersFormatted || (f.passengerNames && f.passengerNames.length > 0 ? f.passengerNames.join(', ') : '');
                  const paxCount = f.passengerCount || (f.passengerNames ? f.passengerNames.length : 1);
                  const paxTitle = paxCount > 1 ? `Passageiro(s) (${paxCount}):` : 'Passageiro(s):';
                  return `
                    <div class="table-flight-pill ${f.isArrivalOnly ? 'table-flight-pill-arrival' : ''}">
                      <div class="table-flight-header">
                        ${f.isArrivalOnly ? '🛬' : '🛫'} <strong>${f.isArrivalOnly ? 'Pouso: ' : ''}${escapeHtml(f.carrier_name || '')} ${escapeHtml(f.identification_number || '')}</strong>
                        ${f.isOvernight ? `<span style="font-size: 6pt; color: #0284c7; background: #e0f2fe; padding: 0 3px; border-radius: 2px;">+1 dia</span>` : ''}
                      </div>
                      <div class="table-flight-route">
                        ${f.isArrivalOnly ? '🛬 Desembarque previsto: ' : '🛫 Partida: '}
                        ${escapeHtml(f.departure_station_code || f.departure_location || '—')} (${f.departure_time || '—'}) ➔ 
                        ${escapeHtml(f.arrival_station_code || f.arrival_location || '—')} (${f.arrival_time || '—'})
                      </div>
                      ${paxLabel ? `
                        <div class="table-flight-pax">
                          👤 ${paxTitle} <strong>${escapeHtml(paxLabel)}</strong>
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('');
              } else if (tDay.title && /transfer|shinkansen|trem|ida para/i.test(tDay.title)) {
                flightsHtml = `<span style="color: #475569; font-weight: 500;">🚆 Deslocamento / ${escapeHtml(tDay.title)}</span>`;
              }

              // 2. Google Calendar Event Chips
              let agendaChipsHtml = '';
              if (tDay.items && tDay.items.length > 0) {
                const itemsToShow = tDay.items.slice(0, 3);
                const remaining = tDay.items.length - 3;
                agendaChipsHtml = `
                  <div class="gcal-chips-wrap">
                    ${itemsToShow.map((it: any) => {
                      const cat = (it.category || 'activity').toLowerCase();
                      const att = it.attendees && it.attendees.length > 1
                        ? (options?.anonymize ? ` (${it.attendees.length} pessoas)` : ` (${it.attendees.join(', ')})`)
                        : '';
                      return `
                        <div class="gcal-chip gcal-cat-${cat}" title="${escapeHtml(it.title)}">
                          <span class="gcal-time">${it.start_time || '—'}</span>
                          <span class="gcal-title">${escapeHtml(it.title)}${escapeHtml(att)}</span>
                        </div>
                      `;
                    }).join('')}
                    ${remaining > 0 ? `<div class="gcal-more">+ ${remaining} compromissos adicionais...</div>` : ''}
                  </div>
                `;
              } else if (tDay.flights && tDay.flights.length > 0) {
                agendaChipsHtml = `
                  <div class="gcal-chips-wrap">
                    ${tDay.flights.map((f: any) => {
                      const pax = f.passengerCount && f.passengerCount > 1
                        ? (options?.anonymize ? ` (${f.passengerCount} pessoas)` : ` (${f.passengerNames.join(', ')})`)
                        : '';
                      return `
                        <div class="gcal-chip gcal-cat-transport">
                          <span class="gcal-time">${f.departure_time || f.arrival_time || '—'}</span>
                          <span class="gcal-title">${f.isArrivalOnly ? 'Desembarque' : 'Embarque'} ${escapeHtml(f.identification_number || '')} (${escapeHtml(f.departure_station_code || '')} ➔ ${escapeHtml(f.arrival_station_code || '')})${escapeHtml(pax)}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              } else {
                agendaChipsHtml = `
                  <div class="gcal-chips-wrap">
                    <div class="gcal-chip gcal-cat-activity">
                      <span class="gcal-time">Dia todo</span>
                      <span class="gcal-title">${escapeHtml(tDay.title || 'Atividades livres no destino')}</span>
                    </div>
                  </div>
                `;
              }

              // 3. Lodging / Overnight
              let lodgingHtml = '';
              if (tDay.hotels && tDay.hotels.length > 0) {
                lodgingHtml = tDay.hotels.map((h: any) => {
                  const guests = !options?.anonymize && h.guest_names
                    ? ` • Hóspedes: ${escapeHtml(h.guest_names)}`
                    : (h.guestCount > 1 ? ` • ${h.guestCount} hóspedes` : '');
                  return `<strong>🏨 ${escapeHtml(h.hotel_name)}</strong><br><small style="color: #64748b;">${escapeHtml(h.city || '')}${guests}</small>`;
                }).join('<div style="margin-top: 4px; border-top: 1px dashed #e2e8f0; padding-top: 3px;"></div>');
              } else if (tDay.hotel) {
                const guests = !options?.anonymize && tDay.hotel.guest_names
                  ? ` • Hóspedes: ${escapeHtml(tDay.hotel.guest_names)}`
                  : (tDay.hotel.guestCount > 1 ? ` • ${tDay.hotel.guestCount} hóspedes` : '');
                lodgingHtml = `<strong>🏨 ${escapeHtml(tDay.hotel.hotel_name)}</strong><br><small style="color: #64748b;">${escapeHtml(tDay.hotel.city || '')}${guests}</small>`;
              } else if (tDay.flights && tDay.flights.some((f: any) => f.arrival_date && f.arrival_date !== f.departure_date)) {
                lodgingHtml = `<span style="color: #2563eb; font-weight: 500;">✈️ A bordo / Voo noturno</span>`;
              } else {
                lodgingHtml = `<span style="color: #475569;">Pernoite em ${escapeHtml(tDay.baseLocation)}</span>`;
              }

              return `
                <tr>
                  <td>
                    <a href="#${tDay.anchorId}" class="table-day-link" title="Ver detalhes do dia">
                      ${tDay.dayNumber ? `<span class="table-day-badge">Dia ${tDay.dayNumber}</span><br>` : ''}
                      <strong>${tDay.dateInfo.formattedWeekday}</strong>
                    </a>
                  </td>
                  <td>
                    <strong>${tDay.icon || '📍'} ${escapeHtml(tDay.baseLocation)}</strong>
                  </td>
                  <td>${flightsHtml}</td>
                  <td>${agendaChipsHtml}</td>
                  <td>${lodgingHtml}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        </div>
      `;
    };

    // Render hotel banner for detailed day cards
    const renderDayHotelBanner = (
      dayStayHotels: any[],
      dayCheckOutHotels: any[],
      dayDateStr: string
    ) => {
      if ((!dayStayHotels || dayStayHotels.length === 0) && (!dayCheckOutHotels || dayCheckOutHotels.length === 0)) {
        return '';
      }

      let checkOutHtml = '';
      if (dayCheckOutHotels && dayCheckOutHotels.length > 0) {
        checkOutHtml = dayCheckOutHotels.map((h: any) => `
          <div class="day-hotel-checkout-pill">
            🧳 <strong>Check-out pela manhã:</strong> ${escapeHtml(h.hotel_name)}${h.city ? ` (${escapeHtml(h.city)})` : ''}${h.check_out_time ? ` até às ${escapeHtml(h.check_out_time)}` : ''}
          </div>
        `).join('');
      }

      if (!dayStayHotels || dayStayHotels.length === 0) {
        return checkOutHtml;
      }

      // Single active hotel
      if (dayStayHotels.length === 1) {
        const h = dayStayHotels[0];
        const inD = toDateStr(h.check_in_date);
        const isCheckInToday = inD === dayDateStr;
        const paxLabel = !options?.anonymize && h.guest_names
          ? h.guest_names
          : (h.guestCount > 1 ? `${h.guestCount} hóspedes` : '');

        return `
          ${checkOutHtml}
          <div class="day-hotel-banner">
            <div class="day-hotel-header">
              <div class="day-hotel-title-wrap">
                <span class="day-hotel-icon">🏨</span>
                <div class="day-hotel-main">
                  <div class="day-hotel-name">${escapeHtml(h.hotel_name)}</div>
                  <div class="day-hotel-sub">
                    ${h.city ? `<span class="day-hotel-city">📍 ${escapeHtml(h.city)}</span>` : ''}
                    ${h.address ? `<span class="day-hotel-addr">• ${escapeHtml(h.address)}</span>` : ''}
                  </div>
                </div>
              </div>
              <span class="day-hotel-tag ${isCheckInToday ? 'tag-checkin' : 'tag-active'}">
                ${isCheckInToday ? '🛎️ Check-in hoje' : '🏨 Hospedagem ativa'}
              </span>
            </div>

            <div class="day-hotel-details-grid">
              <div class="hotel-detail-item">
                <span class="detail-label">Check-in:</span>
                <span class="detail-val">${formatDateBr(h.check_in_date)}${h.check_in_time ? ` a partir das ${escapeHtml(h.check_in_time)}` : ''}</span>
              </div>
              <div class="hotel-detail-item">
                <span class="detail-label">Check-out:</span>
                <span class="detail-val">${formatDateBr(h.check_out_date)}${h.check_out_time ? ` até às ${escapeHtml(h.check_out_time)}` : ''}</span>
              </div>
              ${!options?.anonymize && h.reservation_number ? `
              <div class="hotel-detail-item">
                <span class="detail-label">Reserva:</span>
                <span class="detail-val font-mono">#${escapeHtml(h.reservation_number)}</span>
              </div>` : ''}
              ${h.room_type ? `
              <div class="hotel-detail-item">
                <span class="detail-label">Acomodação:</span>
                <span class="detail-val">${escapeHtml(h.room_type)}</span>
              </div>` : ''}
              ${paxLabel ? `
              <div class="hotel-detail-item">
                <span class="detail-label">Hóspedes:</span>
                <span class="detail-val">${escapeHtml(paxLabel)}</span>
              </div>` : ''}
              ${h.document_id ? `
              <div class="hotel-detail-item">
                <span class="detail-label">Voucher:</span>
                <span class="detail-val">
                  <a href="/api/documents/${h.document_id}/file" target="_blank" rel="noopener noreferrer" class="voucher-link-badge" title="${escapeHtml(h.document_name || 'Ver Voucher')}">📄 Ver Voucher</a>
                </span>
              </div>` : ''}
            </div>
            ${h.notes ? `<div class="day-hotel-notes">ℹ️ <strong>Notas & Observações:</strong> ${escapeHtml(h.notes)}</div>` : ''}
          </div>
        `;
      }

      // Multiple hotels (competing options or split group)
      return `
        ${checkOutHtml}
        <div class="day-hotel-banner day-hotel-multi">
          <div class="day-hotel-multi-header">
            <span class="day-hotel-multi-icon">⚡</span>
            <div class="day-hotel-multi-title">
              Opções Concorrentes de Hospedagem (${dayStayHotels.length} opções cadastradas)
            </div>
          </div>
          <div class="day-hotel-multi-grid">
            ${dayStayHotels.map((h: any, idx: number) => {
              const inD = toDateStr(h.check_in_date);
              const isCheckInToday = inD === dayDateStr;
              const paxLabel = !options?.anonymize && h.guest_names
                ? h.guest_names
                : (h.guestCount > 1 ? `${h.guestCount} hóspedes` : '');

              return `
                <div class="day-hotel-multi-card">
                  <div class="day-hotel-multi-card-top">
                    <span class="day-hotel-option-badge">Opção ${idx + 1}</span>
                    <span class="day-hotel-tag ${isCheckInToday ? 'tag-checkin' : 'tag-active'}">
                      ${isCheckInToday ? '🛎️ Check-in' : '🏨 Noite ativa'}
                    </span>
                  </div>
                  <div class="day-hotel-name" style="margin-top: 3px;">${escapeHtml(h.hotel_name)}</div>
                  <div class="day-hotel-sub">${escapeHtml(h.city || '')}${h.address ? ` • ${escapeHtml(h.address)}` : ''}</div>
                  <div class="day-hotel-details-grid" style="grid-template-columns: 1fr; margin-top: 4px; padding-top: 4px;">
                    ${h.room_type ? `<div class="hotel-detail-item"><span class="detail-label">Quarto:</span> <span class="detail-val">${escapeHtml(h.room_type)}</span></div>` : ''}
                    ${!options?.anonymize && h.reservation_number ? `<div class="hotel-detail-item"><span class="detail-label">Reserva:</span> <span class="detail-val font-mono">#${escapeHtml(h.reservation_number)}</span></div>` : ''}
                    ${paxLabel ? `<div class="hotel-detail-item"><span class="detail-label">Hóspedes:</span> <span class="detail-val">${escapeHtml(paxLabel)}</span></div>` : ''}
                    ${h.document_id ? `<div class="hotel-detail-item"><span class="detail-label">Voucher:</span> <span class="detail-val"><a href="/api/documents/${h.document_id}/file" target="_blank" rel="noopener noreferrer" class="voucher-link-badge" title="${escapeHtml(h.document_name || 'Ver Voucher')}">📄 Ver Voucher</a></span></div>` : ''}
                  </div>
                  ${h.notes ? `<div class="day-hotel-notes" style="font-size: 6.8pt;">ℹ️ ${escapeHtml(h.notes)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${options?.anonymize || options?.isPublicShare ? `
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet">
  ` : ''}
  <title>${escapeHtml(trip.title)} ${trip.subtitle ? escapeHtml(trip.subtitle) : ''} — Trip Book</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,500;0,700;1,400&display=swap');

    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Inter', sans-serif;
        font-size: 8pt;
        color: #888;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      background-color: #f1f5f9;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'Noto Sans', 'Noto Sans CJK JP', 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif;
      color: ${theme.text || '#2f3941'};
      background-color: #f1f5f9;
      line-height: 1.5;
      font-size: 9.5pt;
      margin: 0;
      padding: 0;
    }

    /* Screen Document Canvas / Sheet */
    .tripbook-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 32px 16px 64px 16px;
      box-sizing: border-box;
    }

    .tripbook-sheet {
      width: 100%;
      max-width: 920px;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 20px 30px -10px rgba(0, 0, 0, 0.08);
      padding: 40px 48px;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
    }

    .page-break {
      margin-top: 44px;
      padding-top: 24px;
      border-top: 1px dashed #e2e8f0;
    }

    /* Cover Page */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 44px 36px 32px 36px;
      margin: -40px -48px 36px -48px;
      background: linear-gradient(145deg, #ffffff 0%, ${theme.accent || '#fdf2f4'} 100%);
      border-bottom: 1px solid #e2e8f0;
      border-radius: 15px 15px 0 0;
      position: relative;
    }

    .cover-top {
      text-align: center;
      margin-top: 10px;
    }

    .cover-title {
      font-family: 'Playfair Display', serif;
      font-size: 36pt;
      font-weight: 700;
      letter-spacing: 2px;
      color: ${theme.primary || '#b94a5d'};
      text-transform: uppercase;
      margin-bottom: 6px;
      line-height: 1.15;
    }

    .cover-subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 14pt;
      font-weight: 300;
      letter-spacing: 3px;
      color: #64748b;
      margin-bottom: 20px;
    }

    .cover-period {
      display: inline-block;
      padding: 6px 18px;
      background: #ffffff;
      border: 1px solid ${theme.secondary || '#d989a4'};
      border-radius: 20px;
      font-weight: 500;
      color: ${theme.primary || '#b94a5d'};
      font-size: 10pt;
      margin-bottom: 18px;
    }

    .cover-destinations {
      font-size: 9.5pt;
      color: #475569;
      font-weight: 400;
      max-width: 85%;
      margin: 0 auto;
      line-height: 1.7;
    }

    .cover-image-container {
      margin: 22px auto;
      width: 100%;
      max-width: 680px;
      height: 320px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.12);
      border: 3px solid #ffffff;
    }

    .cover-image-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-bottom {
      text-align: center;
      margin-top: 10px;
      margin-bottom: 10px;
    }

    .cover-tagline {
      font-family: 'Playfair Display', serif;
      font-style: italic;
      font-size: 13pt;
      color: ${theme.primary || '#b94a5d'};
    }

    /* Section Styling */
    h1.section-title {
      font-family: 'Playfair Display', serif;
      font-size: 18pt;
      color: ${theme.primary || '#b94a5d'};
      border-bottom: 2px solid ${theme.secondary || '#d989a4'};
      padding-bottom: 5px;
      margin-bottom: 15px;
      margin-top: 25px;
      page-break-after: avoid;
    }

    h2.subsection-title {
      font-size: 12pt;
      font-weight: 600;
      color: #334155;
      margin-top: 15px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    /* Callout Box */
    .callout-box {
      background: ${theme.accent || '#fdf2f4'};
      border-left: 4px solid ${theme.primary || '#b94a5d'};
      padding: 12px 16px;
      border-radius: 6px;
      margin: 15px 0;
      font-size: 9pt;
      page-break-inside: avoid;
    }

    .callout-title {
      font-weight: 700;
      color: ${theme.primary || '#b94a5d'};
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px 0;
      font-size: 8.5pt;
      page-break-inside: auto;
    }

    table.data-table th, table.data-table td {
      border: 1px solid #e2e8f0;
      padding: 7px 10px;
      text-align: left;
    }

    table.data-table th {
      background-color: ${theme.accent || '#fdf2f4'};
      color: ${theme.primary || '#b94a5d'};
      font-weight: 600;
      font-size: 8.5pt;
    }

    table.data-table tr:nth-child(even) {
      background-color: #fafaf9;
    }

    /* Day Box (Trip Book Day Card) */
    .day-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      margin-bottom: 18px;
      padding: 14px 16px;
      background: #ffffff;
      page-break-inside: avoid;
    }

    .day-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .day-badge {
      background: ${theme.primary || '#b94a5d'};
      color: #ffffff;
      font-weight: 700;
      font-size: 9pt;
      padding: 4px 8px;
      border-radius: 4px;
      min-width: 48px;
      text-align: center;
    }

    .day-title-wrap h3 {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .day-subtitle {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 2px;
    }

    .day-narrative {
      font-size: 9pt;
      line-height: 1.5;
      color: #334155;
      margin-bottom: 10px;
      text-align: justify;
    }

    .day-meta-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      background: #f8fafc;
      padding: 6px 10px;
      border-radius: 5px;
      font-size: 8pt;
      margin-bottom: 10px;
      border: 1px solid #f1f5f9;
    }

    .meta-tag {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #475569;
    }

    .meta-tag strong {
      color: #1e293b;
    }

    /* Alert / Action reminder inside day */
    .day-alert-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-left: 3px solid #f59e0b;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 8pt;
      color: #92400e;
      margin-top: 6px;
    }

    .day-ideas-box {
      background: #f0fdf4;
      border: 1px solid #dcfce7;
      border-left: 3px solid #22c55e;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 8pt;
      color: #166534;
      margin-top: 6px;
    }

    /* Itinerary sub-items */
    .itinerary-sublist {
      margin-top: 8px;
      margin-left: 5px;
    }

    .itinerary-subitem {
      display: flex;
      gap: 8px;
      font-size: 8.5pt;
      margin-bottom: 5px;
      padding: 4px 0;
      border-bottom: 1px dashed #f1f5f9;
    }

    .subitem-time {
      font-weight: 600;
      color: ${theme.primary || '#b94a5d'};
      min-width: 45px;
    }

    .subitem-content {
      flex: 1;
    }

    .subitem-title {
      font-weight: 600;
      color: #1e293b;
    }

    .subitem-tips {
      font-size: 8pt;
      color: #64748b;
      font-style: italic;
    }

    .footer-ornament {
      text-align: center;
      margin: 25px 0 15px 0;
      color: ${theme.secondary || '#d989a4'};
      font-size: 14pt;
    }

    /* Anchor Jump and Scroll */
    html {
      scroll-behavior: smooth;
    }

    :target {
      outline: 2.5px solid ${theme.primary || '#b94a5d'};
      outline-offset: 4px;
      transition: outline 0.3s ease;
    }

    .section-subtitle {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: -4px;
      margin-bottom: 12px;
    }

    /* CALENDAR GRID VIEW */
    .cal-month-wrap {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }

    .cal-month-header {
      font-family: 'Playfair Display', serif;
      font-size: 12pt;
      font-weight: 700;
      color: ${theme.primary || '#b94a5d'};
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .cal-grid-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      margin-bottom: 10px;
    }

    .cal-grid-table th {
      background: ${theme.primary || '#b94a5d'};
      color: #ffffff;
      font-weight: 700;
      font-size: 7.5pt;
      text-align: center;
      padding: 6px 2px;
      letter-spacing: 0.5px;
      border: 1px solid rgba(255,255,255,0.15);
    }

    .cal-grid-table td {
      border: 1px solid #e2e8f0;
      vertical-align: top;
      height: 82px;
      padding: 0;
      background: #ffffff;
    }

    .cal-day-cell {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 5px 6px;
      text-decoration: none;
      color: inherit;
      box-sizing: border-box;
      transition: background 0.15s ease, box-shadow 0.15s ease;
      cursor: pointer;
    }

    .cal-day-cell.cal-day-active:hover {
      background: ${theme.accent || '#fdf2f4'};
      box-shadow: inset 0 0 0 1.5px ${theme.primary || '#b94a5d'};
    }

    .cal-day-cell.cal-day-muted {
      background: #fafaf9;
      opacity: 0.35;
      cursor: default;
    }

    .cal-day-cell.cal-day-empty {
      background: #f8fafc;
      opacity: 0.2;
      cursor: default;
    }

    .cal-day-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }

    .cal-day-num {
      font-weight: 700;
      font-size: 9pt;
      color: #1e293b;
    }

    .cal-day-badge {
      font-size: 6.5pt;
      font-weight: 700;
      background: ${theme.accent || '#fdf2f4'};
      color: ${theme.primary || '#b94a5d'};
      border: 1px solid ${theme.secondary || '#d989a4'};
      padding: 1px 4px;
      border-radius: 3px;
      white-space: nowrap;
    }

    .cal-day-base {
      font-size: 7pt;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .cal-day-title {
      font-size: 6.8pt;
      color: #64748b;
      line-height: 1.2;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      margin-bottom: 3px;
    }

    .cal-day-flight {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 3px;
      padding: 2px 4px;
      margin-top: auto;
      font-size: 6.5pt;
      color: #1e40af;
      line-height: 1.2;
    }

    .cal-day-flight-arrival {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #334155;
    }

    .cal-day-flight-arrival .cal-day-flight-pax {
      color: #64748b;
    }

    .cal-badge-return {
      background: #fef3c7 !important;
      color: #92400e !important;
      border: 1px solid #fde68a !important;
    }

    .cal-badge-home {
      background: #f1f5f9 !important;
      color: #475569 !important;
      border: 1px solid #cbd5e1 !important;
    }

    .cal-day-flight-pax {
      font-size: 6pt;
      color: #2563eb;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      margin-top: 1px;
    }

    /* AGENDA TABLE (DOCX STYLE + GOOGLE CALENDAR) */
    .agenda-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0 25px 0;
      font-size: 8pt;
      page-break-inside: auto;
    }

    .agenda-table th {
      background: ${theme.accent || '#fdf2f4'};
      color: ${theme.primary || '#b94a5d'};
      font-weight: 700;
      font-size: 8pt;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }

    .agenda-table td {
      border: 1px solid #e2e8f0;
      padding: 7px 10px;
      vertical-align: top;
    }

    .agenda-table tr:nth-child(even) {
      background-color: #fafaf9;
    }

    .agenda-table tr:hover {
      background-color: #fdf8f9;
    }

    .table-day-link {
      text-decoration: none;
      color: inherit;
      display: block;
    }

    .table-day-link:hover strong {
      color: ${theme.primary || '#b94a5d'};
      text-decoration: underline;
    }

    .table-day-badge {
      display: inline-block;
      font-size: 6.5pt;
      font-weight: 700;
      background: ${theme.primary || '#b94a5d'};
      color: #ffffff;
      padding: 1px 5px;
      border-radius: 3px;
      margin-bottom: 2px;
    }

    .table-flight-pill {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 5px;
      padding: 4px 6px;
      margin-bottom: 4px;
      font-size: 7.5pt;
      color: #1e3a8a;
    }

    .table-flight-pill-arrival {
      background: #f8fafc;
      border-color: #cbd5e1;
      color: #334155;
    }

    .table-flight-pill-arrival .table-flight-route {
      color: #64748b;
    }

    .table-flight-pill-arrival .table-flight-pax {
      color: #475569;
    }

    .table-flight-header {
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .table-flight-route {
      font-size: 7pt;
      color: #2563eb;
      margin-top: 1px;
    }

    .table-flight-pax {
      font-size: 6.8pt;
      font-weight: 600;
      color: #1d4ed8;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 3px;
    }

    /* GOOGLE CALENDAR CHIPS */
    .gcal-chips-wrap {
      display: flex;
      flex-direction: column;
      gap: 3.5px;
    }

    .gcal-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2.5px 6px;
      border-radius: 4px;
      font-size: 7.5pt;
      line-height: 1.25;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }

    .gcal-chip .gcal-time {
      font-weight: 700;
      font-size: 7pt;
      min-width: 32px;
      opacity: 0.9;
    }

    .gcal-chip .gcal-title {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .gcal-cat-transport {
      background-color: #eff6ff;
      border-left: 3.5px solid #2563eb;
      color: #1e3a8a;
    }

    .gcal-cat-attraction {
      background-color: #ecfdf5;
      border-left: 3.5px solid #059669;
      color: #064e3b;
    }

    .gcal-cat-restaurant {
      background-color: #fffbeb;
      border-left: 3.5px solid #d97706;
      color: #78350f;
    }

    .gcal-cat-hotel {
      background-color: #f5f3ff;
      border-left: 3.5px solid #7c3aed;
      color: #4c1d95;
    }

    .gcal-cat-activity {
      background-color: #fdf2f4;
      border-left: 3.5px solid ${theme.primary || '#b94a5d'};
      color: #4c0519;
    }

    .gcal-cat-note {
      background-color: #f8fafc;
      border-left: 3.5px solid #64748b;
      color: #334155;
    }

    .gcal-more {
      font-size: 6.8pt;
      color: #64748b;
      font-style: italic;
      padding-left: 6px;
      margin-top: 1px;
    }

    /* Day Card flight banner & back link */
    .cal-back-link {
      font-size: 7.5pt;
      color: ${theme.primary || '#b94a5d'};
      text-decoration: none;
      font-weight: 600;
      padding: 2px 7px;
      border: 1px solid ${theme.secondary || '#d989a4'};
      border-radius: 4px;
      background: #ffffff;
      white-space: nowrap;
      margin-left: auto;
    }

    .cal-back-link:hover {
      background: ${theme.accent || '#fdf2f4'};
    }

    .day-flight-banner {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 4px solid #2563eb;
      padding: 7px 12px;
      border-radius: 5px;
      font-size: 8pt;
      color: #1e3a8a;
      margin-bottom: 12px;
    }

    .day-hotel-banner {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-left: 4px solid #16a34a;
      border-radius: 6px;
      padding: 9px 12px;
      margin-bottom: 12px;
      font-size: 8pt;
      color: #14532d;
    }
    .day-hotel-multi {
      background: #fdfaf0;
      border-color: #fde68a;
      border-left-color: #d97706;
      color: #78350f;
    }
    .day-hotel-multi-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      font-size: 8.5pt;
      margin-bottom: 8px;
      color: #92400e;
    }
    .day-hotel-multi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 8px;
    }
    .day-hotel-multi-card {
      background: #ffffff;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .day-hotel-multi-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }
    .day-hotel-option-badge {
      font-size: 6.5pt;
      font-weight: 700;
      background: #fef3c7;
      color: #92400e;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .day-hotel-checkout-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #64748b;
      border-radius: 4px;
      padding: 5px 9px;
      font-size: 7.5pt;
      color: #334155;
      margin-bottom: 8px;
    }
    .day-hotel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 5px;
    }
    .day-hotel-title-wrap {
      display: flex;
      align-items: flex-start;
      gap: 7px;
    }
    .day-hotel-icon {
      font-size: 13pt;
      line-height: 1;
    }
    .day-hotel-name {
      font-weight: 700;
      font-size: 9pt;
      color: #064e3b;
    }
    .day-hotel-sub {
      font-size: 7.2pt;
      color: #047857;
      margin-top: 1px;
    }
    .day-hotel-tag {
      font-size: 6.5pt;
      font-weight: 700;
      padding: 1.5px 5px;
      border-radius: 3px;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .tag-checkin {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #86efac;
    }
    .tag-active {
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
    }
    .day-hotel-details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 4px 12px;
      padding-top: 5px;
      border-top: 1px solid rgba(22, 163, 74, 0.15);
      margin-top: 5px;
    }
    .hotel-detail-item {
      font-size: 7.5pt;
      color: #166534;
      display: flex;
      align-items: baseline;
      gap: 4px;
      min-width: 0;
    }
    .detail-label {
      color: #047857;
      font-weight: 600;
      font-size: 7pt;
      flex-shrink: 0;
    }
    .detail-val {
      color: #064e3b;
      min-width: 0;
    }
    .voucher-link-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: #047857 !important;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 1.5px 7px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      vertical-align: middle;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .voucher-link-badge:hover {
      background: #d1fae5;
      border-color: #6ee7b7;
      text-decoration: none;
      color: #065f46 !important;
    }
    .day-hotel-notes {
      margin-top: 5px;
      padding-top: 4px;
      border-top: 1px dashed #bbf7d0;
      font-size: 7pt;
      color: #15803d;
      line-height: 1.35;
    }
    .marker-hotel {
      background: #059669 !important;
      color: #ffffff !important;
      font-size: 11px !important;
    }
    .marker-airport {
      background: #0284c7 !important;
      color: #ffffff !important;
      font-size: 11px !important;
    }

    /* Top Action Bar (Public & Internal View) */
    .tripbook-top-bar, .public-share-top-bar {
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 8.5pt;
      position: sticky;
      top: 0;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.18);
      width: 100%;
      box-sizing: border-box;
    }
    .tripbook-top-bar-inner, .public-share-inner {
      max-width: 920px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .tripbook-top-info, .public-share-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .tripbook-badge, .public-share-badge {
      background: #334155;
      color: #38bdf8;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 8pt;
      letter-spacing: 0.3px;
    }
    .tripbook-badge.admin-badge, .public-share-badge.admin-badge {
      background: #1e3a5f;
      color: #60a5fa;
    }
    .tripbook-subtitle-text {
      color: #94a3b8;
      font-size: 8.5pt;
    }
    .tripbook-top-actions, .public-share-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .tripbook-btn, .public-share-btn {
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 8pt;
      font-weight: 600;
      text-decoration: none;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .tripbook-btn.print-btn, .public-share-btn.print-btn {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
    }
    .tripbook-btn.print-btn:hover, .public-share-btn.print-btn:hover {
      background: #334155;
      color: #ffffff;
    }
    .tripbook-btn.pdf-btn, .public-share-btn.pdf-btn {
      background: ${theme.primary || '#b94a5d'};
      color: #ffffff;
    }
    .tripbook-btn.pdf-btn:hover, .public-share-btn.pdf-btn:hover {
      filter: brightness(1.1);
    }
    .tripbook-btn:disabled {
      opacity: 0.85;
      cursor: wait;
      pointer-events: none;
    }
    .tripbook-btn.btn-loading {
      background: #0284c7 !important;
      color: #ffffff !important;
    }
    .tripbook-btn.btn-success {
      background: #16a34a !important;
      color: #ffffff !important;
    }
    .tripbook-btn.btn-error {
      background: #dc2626 !important;
      color: #ffffff !important;
    }

    /* Table Responsive Wrapper */
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 10px 0 18px 0;
      border-radius: 8px;
    }

    /* Daily Mini-Map */
    .day-minimap-wrapper {
      margin: 10px 0 12px 0;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      background: #f8fafc;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .day-minimap-header {
      padding: 5px 10px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8pt;
      font-weight: 700;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .day-minimap-canvas {
      height: 135px;
      width: 100%;
      background: #e2e8f0;
      position: relative;
      z-index: 0;
    }
    .itinerary-mini-marker-wrap {
      background: transparent;
      border: 0;
    }
    .itinerary-mini-marker {
      display: flex;
      width: 20px;
      height: 20px;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      border-radius: 9999px;
      background: ${theme.primary || '#b94a5d'};
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      line-height: 1;
    }

    /* Responsive Mobile Styles */
    @media screen and (max-width: 768px) {
      .tripbook-wrapper {
        padding: 12px 8px 48px 8px;
      }
      .tripbook-sheet {
        padding: 24px 16px;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }
      .cover-page {
        margin: -24px -16px 24px -16px;
        padding: 24px 14px 18px 14px;
        border-radius: 11px 11px 0 0;
      }
      .cover-title {
        font-size: 22pt;
        letter-spacing: 1px;
      }
      .cover-subtitle {
        font-size: 11pt;
        letter-spacing: 2px;
        margin-bottom: 14px;
      }
      .cover-period {
        font-size: 8.5pt;
        padding: 4px 12px;
      }
      .cover-destinations {
        max-width: 100%;
        font-size: 8.5pt;
      }
      .cover-image-container {
        height: 180px;
        max-width: 100%;
        margin: 16px auto;
      }
      .page-break {
        margin-top: 32px;
        padding-top: 16px;
      }
      h1.section-title {
        font-size: 15pt;
        margin-top: 18px;
      }
      h2.subsection-title {
        font-size: 11pt;
      }
      .day-card {
        padding: 12px;
        margin-bottom: 14px;
      }
      .day-header {
        flex-wrap: wrap;
        gap: 8px;
      }
      .tripbook-top-bar, .public-share-top-bar {
        padding: 8px 12px;
      }
      .tripbook-subtitle-text, .public-share-info span:not(.public-share-badge) {
        display: none;
      }
    }

    /* Print & PDF Export Rules */
    @media print {
      html, body {
        background-color: #ffffff !important;
        background: #ffffff !important;
      }
      .tripbook-top-bar, .public-share-top-bar {
        display: none !important;
      }
      .tripbook-wrapper {
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
        width: 100% !important;
        background: transparent !important;
      }
      .tripbook-sheet {
        max-width: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        overflow: visible !important;
      }
      .cover-page {
        height: 100vh !important;
        min-height: 250mm !important;
        margin: 0 !important;
        padding: 20mm 15mm !important;
        border-radius: 0 !important;
        border: 1px solid rgba(0,0,0,0.06) !important;
        page-break-after: always !important;
        break-after: page !important;
        background: linear-gradient(145deg, #ffffff 0%, ${theme.accent || '#fdf2f4'} 100%) !important;
      }
      .cover-title {
        font-size: 38pt !important;
      }
      .cover-subtitle {
        font-size: 16pt !important;
        margin-bottom: 25px !important;
      }
      .cover-image-container {
        height: 95mm !important;
        max-width: 160mm !important;
        margin: 25px auto !important;
      }
      .page-break {
        page-break-before: always !important;
        break-before: page !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        border-top: none !important;
      }
      .day-minimap-wrapper {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .leaflet-tile {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .table-responsive {
        overflow-x: visible !important;
        border: none !important;
      }
    }
  </style>
</head>
<body>

  <div class="tripbook-top-bar public-share-top-bar">
    <div class="tripbook-top-bar-inner public-share-inner">
      <div class="tripbook-top-info public-share-info">
        ${options?.isPublicShare ? `
          <span class="tripbook-badge public-share-badge">🔒 Link Compartilhado</span>
          <span class="tripbook-subtitle-text">Este roteiro foi compartilhado com dados pessoais e identificadores de reserva anonimizados.</span>
        ` : `
          <span class="tripbook-badge public-share-badge admin-badge">📖 Trip Book Oficial</span>
          <span class="tripbook-subtitle-text">${escapeHtml(trip.title)} • Modo Visualização</span>
        `}
      </div>
      <div class="tripbook-top-actions public-share-actions">
        <button onclick="window.print()" class="tripbook-btn public-share-btn print-btn">🖨️ Imprimir</button>
        ${options.pdfDownloadUrl ? `
          <button id="tripbook-download-btn" onclick="downloadTripBookPdf(this, '${options.pdfDownloadUrl}')" class="tripbook-btn public-share-btn pdf-btn">
            <span class="btn-icon">📥</span> <span class="btn-text">Baixar PDF</span>
          </button>
        ` : ''}
      </div>
    </div>
  </div>

  <div class="tripbook-wrapper">
    <div class="tripbook-sheet">

  ${sec.cover ? `
  <!-- CAPA EDITORIAL -->
  <div class="cover-page">
    <div class="cover-top">
      <div class="cover-title">${trip.title}</div>
      ${trip.subtitle ? `<div class="cover-subtitle">${trip.subtitle}</div>` : ''}
      <div class="cover-period">${formatDateBr(trip.start_date)} — ${formatDateBr(trip.end_date)}</div>
      <div class="cover-destinations">${citiesList}</div>
    </div>

    ${
      trip.cover_image_url
        ? `<div class="cover-image-container">
             <img src="${trip.cover_image_url}" alt="Capa da viagem" />
           </div>`
        : ''
    }

    <div class="cover-bottom">
      <div class="cover-tagline">${trip.tagline || 'Guia e Roteiro Completo de Viagem'}</div>
    </div>
  </div>
  ` : ''}

  ${sec.overview || sec.calendar ? `
  <!-- VISÃO GERAL & CALENDÁRIO -->
  <div class="page-content">
    ${sec.overview ? `
    <h1 class="section-title">Visão Geral da Viagem</h1>
    ${
      trip.description
        ? `<p style="font-size: 9.5pt; line-height: 1.6; margin-bottom: 15px; text-align: justify;">${trip.description}</p>`
        : ''
    }

    <div class="callout-box">
      <div class="callout-title">🌸 JANELA SAZONAL & INFORMAÇÕES DE VIAGEM</div>
      <p>As datas do roteiro foram estrategicamente planejadas para coincidir com as melhores condições e atrativos locais. Recomenda-se checar previsões meteorológicas finas e horários locais 7 a 10 dias antes do embarque.</p>
    </div>
    ` : ''}

    ${sec.calendar ? `
    <div id="calendario">
      <h2 class="subsection-title">📅 Visão de Calendário da Viagem</h2>
      <p class="section-subtitle">Grade mensal da viagem. Clique em qualquer dia para navegar diretamente aos detalhes do roteiro.</p>
      
      ${Object.entries(monthsMap).map(([mKey, mData]) => renderMonthGrid(mKey, mData)).join('')}

      <h2 class="subsection-title" style="margin-top: 25px;">📋 Programação Geral & Agenda Diária</h2>
      <p class="section-subtitle">Visão consolidada com bases, voos de cada membro e os primeiros compromissos diários formatados no padrão Google Calendar.</p>

      ${renderAgendaTable()}
    </div>
    ` : ''}
  </div>
  ` : ''}

  ${
    climateGuides && climateGuides.length > 0
      ? `
  <!-- CLIMA E MALA -->
  <div class="page-break">
    <h1 class="section-title">Clima, Mala & Recomendações</h1>
    <p style="margin-bottom: 12px; color: #64748b; font-size: 8.5pt;">Temperaturas médias históricas e itens essenciais recomendados para a bagagem:</p>
    <div class="table-responsive">
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%;">Cidade / Período</th>
          <th style="width: 30%;">Faixa Típica</th>
          <th>O que levar / Recomendações</th>
        </tr>
      </thead>
      <tbody>
        ${climateGuides
          .map(
            (cg: any) => `
          <tr>
            <td><strong>${cg.city_or_period}</strong></td>
            <td>${cg.typical_range || '—'}</td>
            <td>${cg.what_to_pack || '—'}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    </div>
  </div>
  `
      : ''
  }

  ${sec.dayByDay ? `
  <!-- ROTEIRO DIA A DIA -->
  <div class="page-break">
    <h1 class="section-title">Roteiro Detalhado por Dia</h1>
    
    ${days
      .map(
        (day: any) => {
          const ds = toDateStr(day.date);
          const dayFlights = segmentsByDate[ds] || [];
          const dayStayHotels = stayHotelsByDate[ds] || [];
          const dayCheckOutHotels = checkOutHotelsByDate[ds] || [];
          const dayItems = aggregateItineraryItems(day.items || [], { anonymize: options?.anonymize });

          return `
      <div class="day-card" id="dia-${day.day_number}" data-date="${ds}">
        <div class="day-header">
          <div class="day-badge">${formatDateShort(day.date)}</div>
          <div class="day-title-wrap">
            <h3>${day.icon || '📍'} ${day.title || `Dia ${day.day_number}`}</h3>
            ${day.subtitle ? `<div class="day-subtitle">${day.subtitle}</div>` : ''}
          </div>
          <a href="#calendario" class="cal-back-link" title="Voltar ao Calendário">↑ Calendário</a>
        </div>

        ${
          dayFlights.length > 0
            ? `
          <div class="day-flight-banner">
            <div style="font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
              ✈️ Voos Agendados para este Dia:
            </div>
            ${dayFlights.map((f: any) => {
              const paxLabel = f.passengersFormatted || (f.passengerNames && f.passengerNames.length > 0 ? f.passengerNames.join(', ') : '');
              const paxCount = f.passengerCount || (f.passengerNames ? f.passengerNames.length : 1);
              return `
                <div style="margin-top: 3px;">
                  <strong>${escapeHtml(f.carrier_name || '')} ${escapeHtml(f.identification_number || '')}</strong>: 
                  ${escapeHtml(f.departure_station_code || f.departure_location || '')} (${f.departure_time || '—'}) ➔ 
                  ${escapeHtml(f.arrival_station_code || f.arrival_location || '')} (${f.arrival_time || '—'})
                  ${paxLabel ? ` • Passageiro(s)${paxCount > 1 ? ` (${paxCount})` : ''}: <strong>${escapeHtml(paxLabel)}</strong>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `
            : ''
        }

        ${sec.hotels ? renderDayHotelBanner(dayStayHotels, dayCheckOutHotels, ds) : ''}

        ${day.narrative ? `<div class="day-narrative">${day.narrative}</div>` : ''}

        <div class="day-meta-strip">
          <div class="meta-tag">📍 Base: <strong>${day.base_location || 'Em Trânsito'}</strong></div>
          ${
            day.temperature_min || day.temperature_max
              ? `<div class="meta-tag">🌡 Clima: <strong>${day.temperature_min || ''}–${day.temperature_max || ''} °C</strong></div>`
              : ''
          }
          ${
            day.estimated_cost
              ? `<div class="meta-tag">💴 Custo: <strong>${day.cost_currency || ''} ${day.estimated_cost}</strong></div>`
              : ''
          }
          ${day.included_services ? `<div class="meta-tag">✓ Incluído: <strong>${day.included_services}</strong></div>` : ''}
        </div>

        ${
          dayMapsData[day.day_number] && dayMapsData[day.day_number].length > 0
            ? `
          <div class="day-minimap-wrapper">
            <div class="day-minimap-header">
              <span>📍 Mapa do dia • ${dayMapsData[day.day_number].length} ${dayMapsData[day.day_number].length === 1 ? 'local mapeado' : 'locais mapeados'}${dayMapsData[day.day_number].some((p: any) => p.pointType === 'HOTEL') ? ' (com hospedagem)' : ''}</span>
            </div>
            <div id="map-day-${day.day_number}" class="day-minimap-canvas"></div>
          </div>
        `
            : ''
        }

        ${
          dayItems.length > 0
            ? `
          <div class="itinerary-sublist">
            ${dayItems
              .map(
                (item: any) => `
              <div class="itinerary-subitem">
                <div class="subitem-time">${item.start_time || '—'}</div>
                <div class="subitem-content">
                  <div class="subitem-title">
                    ${item.title}
                    ${
                      item.latitude && item.longitude && !(Number(item.latitude) === 0 && Number(item.longitude) === 0)
                        ? `<a href="https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}" target="_blank" rel="noopener noreferrer" style="text-decoration: none; margin-left: 5px; vertical-align: middle; display: inline-flex;" title="Abrir no Google Maps">
                            <span style="font-size: 8.5pt;">📍</span>
                          </a>`
                        : ''
                    }
                    ${
                      !options?.anonymize && !options?.isPublicShare
                        ? ((item.documents && item.documents.length > 0)
                            ? item.documents
                            : (item.document_id ? [{ id: item.document_id, original_name: item.document_name }] : [])
                          ).map((doc: any) => `
                            <a href="/api/documents/${doc.id || doc.document_id}/file" target="_blank" rel="noopener noreferrer" style="text-decoration: none; margin-left: 6px; display: inline-flex; align-items: center; gap: 3px; font-size: 7pt; color: #92400e; background: #fef3c7; padding: 1px 5px; border-radius: 4px; border: 1px solid #fde68a; vertical-align: middle;" title="Abrir documento importado: ${escapeHtml(doc.original_name || 'Arquivo')}">
                              <span>📄</span>
                              <span style="max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(doc.original_name || 'Arquivo')}</span>
                            </a>
                          `).join('')
                        : ''
                    }
                    ${
                      !options?.anonymize && item.attendees && item.attendees.length > 1
                        ? `<span style="font-size: 7pt; color: #1e3a8a; background: #eff6ff; padding: 1px 5px; border-radius: 4px; border: 1px solid #bfdbfe; margin-left: 6px; vertical-align: middle;">
                            👥 ${item.attendees.length} pessoas: ${escapeHtml(item.attendees.join(', '))}
                          </span>`
                        : ''
                    }
                  </div>
                  ${item.address ? `<div style="font-size: 7.5pt; color: #64748b;">${item.address}</div>` : ''}
                  ${
                    item.tips
                      ? `<div class="subitem-tips">💡 ${
                          options?.anonymize
                            ? item.tips.replace(/Titular:\s*[^|]+/i, '').replace(/Código:\s*[^|]+/i, '').replace(/\|\s*\|/g, '|').trim()
                            : item.tips
                        }</div>`
                      : ''
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        ${
          day.ideas && day.ideas.length > 0
            ? `
          <div class="day-ideas-box">
            <strong>✨ IDEIAS:</strong> ${Array.isArray(day.ideas) ? day.ideas.join(' • ') : day.ideas}
          </div>
        `
            : ''
        }

        ${
          day.alerts && day.alerts.length > 0
            ? `
          <div class="day-alert-box">
            <strong>🔔 RESERVAR / CONFERIR:</strong> ${Array.isArray(day.alerts) ? day.alerts.join(' • ') : day.alerts}
          </div>
        `
            : ''
        }
      </div>
    `;
        }
      )
      .join('')}

    <div class="footer-ornament">❀  ❀  ❀</div>
  </div>
  ` : ''}

  ${sec.transports ? (() => {
    if (!transports || transports.length === 0) return '';

    // Condense / group transports that share the same flights or empty duplicate reservations
    const condenseTransports = (rawTransports: any[]) => {
      const condensed: any[] = [];

      for (const tr of rawTransports) {
        const trType = tr.type || 'FLIGHT';
        const trProvider = (tr.provider_name || '').trim().toLowerCase();
        const trSegments = tr.segments || [];

        const matched = condensed.find((g) => {
          if (g.type !== trType) return false;
          if (trProvider && g.provider_name && g.provider_name.trim().toLowerCase() === trProvider) {
            return true;
          }
          if (trSegments.length > 0 && g.segments.length > 0) {
            return trSegments.some((s1: any) =>
              g.segments.some((s2: any) =>
                s1.identification_number &&
                s2.identification_number &&
                s1.identification_number.trim().toUpperCase() === s2.identification_number.trim().toUpperCase() &&
                toDateStr(s1.departure_date) === toDateStr(s2.departure_date)
              )
            );
          }
          return false;
        });

        if (matched) {
          if (tr.booking_code && !matched.booking_codes.includes(tr.booking_code)) {
            matched.booking_codes.push(tr.booking_code);
          }

          for (const seg of trSegments) {
            const existingSeg = matched.segments.find((s: any) =>
              s.identification_number &&
              seg.identification_number &&
              s.identification_number.trim().toUpperCase() === seg.identification_number.trim().toUpperCase() &&
              toDateStr(s.departure_date) === toDateStr(seg.departure_date)
            );

            if (existingSeg) {
              const currentPax = extractPassengerDetails(existingSeg.passenger_names, existingSeg.seat, matched.booking_codes[0]);
              const newPax = extractPassengerDetails(seg.passenger_names, seg.seat, tr.booking_code);
              for (const np of newPax) {
                const normNp = np.name.toLowerCase().trim();
                const idx = currentPax.findIndex(cp => cp.name.toLowerCase().trim() === normNp);
                if (idx >= 0) {
                  if (!currentPax[idx].seat && np.seat) currentPax[idx].seat = np.seat;
                  if (!currentPax[idx].bookingCode && np.bookingCode) currentPax[idx].bookingCode = np.bookingCode;
                } else {
                  currentPax.push(np);
                }
              }
              existingSeg.passenger_names = currentPax;
            } else {
              matched.segments.push(seg);
            }
          }
        } else {
          condensed.push({
            type: trType,
            provider_name: tr.provider_name,
            booking_codes: tr.booking_code ? [tr.booking_code] : [],
            segments: [...trSegments],
          });
        }
      }

      // Filter out reservations with 0 segments if another with segments exists
      const withSegments = condensed.filter(g => g.segments && g.segments.length > 0);
      const finalGroups = withSegments.length > 0 ? withSegments : condensed;

      for (const g of finalGroups) {
        g.segments.sort((a: any, b: any) => {
          const d1 = `${toDateStr(a.departure_date)} ${a.departure_time || ''}`;
          const d2 = `${toDateStr(b.departure_date)} ${b.departure_time || ''}`;
          return d1.localeCompare(d2);
        });
      }

      return finalGroups;
    };

    const condensedList = condenseTransports(transports);
    if (condensedList.length === 0) return '';

    return `
  <!-- TRANSPORTES & VOOS -->
  <div class="page-break" id="transportes">
    <h1 class="section-title">Transportes & Voos</h1>
    ${condensedList
      .map((tr: any) => {
        // Collect mapping of passenger -> bookingCode across all segments in this group
        const paxBookingMap = new Map<string, string>();
        for (const s of tr.segments) {
          const pDetails = extractPassengerDetails(s.passenger_names, s.seat, tr.booking_codes[0]);
          for (const p of pDetails) {
            if (p.name && p.bookingCode) {
              paxBookingMap.set(p.name, p.bookingCode);
            }
          }
        }

        let bookingCodesHtml = '';
        if (options?.anonymize) {
          bookingCodesHtml = `<span style="font-weight: bold; color: ${theme.primary}; font-size: 13px;">(Localizador: ******)</span>`;
        } else if (paxBookingMap.size > 1) {
          const items = Array.from(paxBookingMap.entries()).map(
            ([pName, pCode]) => `<strong>${escapeHtml(pName)}:</strong> <span style="font-family: monospace; font-weight: bold; color: ${theme.primary}; background: #fdf2f4; padding: 1px 6px; border-radius: 4px; border: 1px solid #fecdd3;">${escapeHtml(pCode)}</span>`
          );
          bookingCodesHtml = `<span style="color: #475569; font-size: 12px; font-weight: normal; margin-left: 8px;">(Localizadores: ${items.join(' &nbsp;&bull;&nbsp; ')})</span>`;
        } else if (tr.booking_codes && tr.booking_codes.length > 0) {
          const codes = tr.booking_codes.map((c: string) => `<span style="font-family: monospace; font-weight: bold; color: ${theme.primary}; background: #fdf2f4; padding: 1px 6px; border-radius: 4px; border: 1px solid #fecdd3;">${escapeHtml(c)}</span>`).join(', ');
          bookingCodesHtml = `<span style="color: #475569; font-size: 12px; font-weight: normal; margin-left: 8px;">(Localizador${tr.booking_codes.length > 1 ? 'es' : ''}: ${codes})</span>`;
        }

        return `
      <div style="margin-bottom: 24px;">
        <h2 class="subsection-title" style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <span>${tr.type === 'FLIGHT' ? '✈️ Reserva Aérea' : '🚆 Transporte'}: ${escapeHtml(tr.provider_name || '')}</span>
          ${bookingCodesHtml}
        </h2>
        <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Voo / Veículo</th>
              <th>Origem</th>
              <th>Partida</th>
              <th>Destino</th>
              <th>Chegada</th>
              <th>Duração / Conexão</th>
              <th>Classe</th>
              <th>Passageiro(s) & Poltronas</th>
            </tr>
          </thead>
          <tbody>
            ${
              tr.segments && tr.segments.length > 0
                ? tr.segments
                    .map((s: any) => {
                      const paxDetails = extractPassengerDetails(s.passenger_names, s.seat, tr.booking_codes[0]);
                      const paxHtml = paxDetails.length > 0
                        ? paxDetails
                            .map((p: any) => {
                              const seatTag = p.seat
                                ? `<strong style="color: ${theme.primary}; font-weight: bold;">${escapeHtml(p.seat)}</strong>`
                                : `<span style="color: #94a3b8; font-style: italic; font-size: 11px;">Não marcado</span>`;
                              return `
                                <div style="margin: 2px 0; line-height: 1.4;">
                                  <strong>${escapeHtml(p.name)}</strong>: Poltrona ${seatTag}
                                </div>
                              `;
                            })
                            .join('')
                        : '—';

                      return `
                  <tr>
                    <td><strong>${escapeHtml(s.identification_number || s.carrier_name || 'Voo')}</strong></td>
                    <td>${escapeHtml(s.departure_location || '—')} (${escapeHtml(s.departure_station_code || '—')})</td>
                    <td>${formatDateShort(s.departure_date)} ${escapeHtml(s.departure_time || '')}</td>
                    <td>${escapeHtml(s.arrival_location || '—')} (${escapeHtml(s.arrival_station_code || '—')})</td>
                    <td>${formatDateShort(s.arrival_date)} ${escapeHtml(s.arrival_time || '')}</td>
                    <td>${s.duration_minutes ? Math.floor(s.duration_minutes / 60) + 'h' + (s.duration_minutes % 60) + 'm' : '—'} ${s.layover_minutes ? `(Conexão: ${Math.floor(s.layover_minutes / 60)}h${s.layover_minutes % 60}m)` : ''}</td>
                    <td>${escapeHtml(s.cabin_class || 'Econômica')}</td>
                    <td>${paxHtml}</td>
                  </tr>
                `;
                    })
                    .join('')
                : `<tr><td colspan="8">Nenhum trecho detalhado</td></tr>`
            }
          </tbody>
        </table>
        </div>
      </div>
    `;
      })
      .join('')}
  </div>
  `;
  })() : ''}

  ${
    sec.hotels && hotels && hotels.length > 0
      ? `
  <!-- HOSPEDAGENS -->
  <div class="page-break" id="hospedagens">
    <h1 class="section-title">Hospedagens & Vouchers</h1>
    <div class="table-responsive">
    <table class="data-table">
      <thead>
        <tr>
          <th>Hotel / Pousada</th>
          <th>Cidade</th>
          <th>Check-in</th>
          <th>Check-out</th>
          <th>Reserva / Hóspede</th>
          <th>Acomodação</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${hotels
          .map(
            (h: any) => `
          <tr>
            <td>
              <strong>${escapeHtml(h.hotel_name)}</strong>
              ${h.document_id ? `<div style="margin-top: 3px;"><a href="/api/documents/${h.document_id}/file" target="_blank" rel="noopener noreferrer" class="voucher-link-badge" title="${escapeHtml(h.document_name || 'Ver Voucher')}">📄 Ver Voucher</a></div>` : ''}
              <br><small style="color: #64748b;">${escapeHtml(h.address || '')}</small>
              ${h.notes ? `<br><small style="color: #92400e; font-size: 7pt; font-style: italic;">ℹ️ ${escapeHtml(h.notes)}</small>` : ''}
            </td>
            <td>${escapeHtml(h.city || '')}</td>
            <td>${formatDateBr(h.check_in_date)} ${h.check_in_time ? `às ${escapeHtml(h.check_in_time)}` : ''}</td>
            <td>${formatDateBr(h.check_out_date)} ${h.check_out_time ? `até às ${escapeHtml(h.check_out_time)}` : ''}</td>
            <td>${options?.anonymize ? 'Confirmada' : escapeHtml(h.reservation_number || '—')}<br><small>${options?.anonymize ? 'Viajante(s)' : escapeHtml(h.guest_names || '')}</small></td>
            <td>${escapeHtml(h.room_type || 'Quarto Standard')}</td>
            <td><span style="color: #16a34a; font-weight: bold;">${escapeHtml(h.payment_status || 'Confirmado')}</span></td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    </div>
  </div>
  `
      : ''
  }

  ${
    sec.checklist && checklists && checklists.length > 0
      ? `
  <!-- CHECKLIST FINAL -->
  <div class="page-break">
    <h1 class="section-title">Checklist Final de Viagem</h1>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 15px;">
      ${checklists
        .map(
          (c: any) => `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 9pt; padding: 6px; border-bottom: 1px dashed #e2e8f0;">
          <input type="checkbox" ${c.is_completed ? 'checked' : ''} style="accent-color: ${theme.primary || '#b94a5d'};" />
          <span style="${c.is_completed ? 'text-decoration: line-through; color: #94a3b8;' : ''}">${c.title}</span>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
  `
      : ''
  }

    </div><!-- /tripbook-sheet -->
  </div><!-- /tripbook-wrapper -->

  <script>
    (function() {
      function initTripBookMaps() {
        if (typeof L === 'undefined') return;
        var dayMaps = ${JSON.stringify(dayMapsData)};
        Object.keys(dayMaps).forEach(function(dayNum) {
          var points = dayMaps[dayNum];
          var el = document.getElementById('map-day-' + dayNum);
          if (!el || !points || points.length === 0) return;
          try {
            var map = L.map(el, {
              center: [points[0].latitude, points[0].longitude],
              zoom: 13,
              dragging: false,
              touchZoom: false,
              scrollWheelZoom: false,
              doubleClickZoom: false,
              boxZoom: false,
              keyboard: false,
              zoomControl: false,
              attributionControl: false
            });
            L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
              maxZoom: 19
            }).addTo(map);

            var group = L.layerGroup().addTo(map);
            points.forEach(function(p) {
              var icon;
              var tooltipContent;
              if (p.pointType === 'HOTEL') {
                icon = L.divIcon({
                  className: 'itinerary-mini-marker-wrap',
                  html: '<span class="itinerary-mini-marker marker-hotel">🏨</span>',
                  iconSize: [22, 22],
                  iconAnchor: [11, 11]
                });
                tooltipContent = '🏨 ' + p.title + (p.subtitle ? ' (' + p.subtitle + ')' : '');
              } else if (p.pointType === 'AIRPORT') {
                icon = L.divIcon({
                  className: 'itinerary-mini-marker-wrap',
                  html: '<span class="itinerary-mini-marker marker-airport">✈️</span>',
                  iconSize: [22, 22],
                  iconAnchor: [11, 11]
                });
                tooltipContent = '✈️ ' + p.title + (p.subtitle ? ' (' + p.subtitle + ')' : '');
              } else {
                icon = L.divIcon({
                  className: 'itinerary-mini-marker-wrap',
                  html: '<span class="itinerary-mini-marker" style="background-color: ${theme.primary || '#b94a5d'}">' + (p.number || '•') + '</span>',
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                });
                tooltipContent = (p.number ? p.number + '. ' : '') + p.title;
              }
              L.marker([p.latitude, p.longitude], { icon: icon })
                .bindTooltip(tooltipContent, { direction: 'top', offset: [0, -10] })
                .addTo(group);
            });

            if (points.length === 1) {
              map.setView([points[0].latitude, points[0].longitude], 14, { animate: false });
            } else {
              var bounds = L.latLngBounds(points.map(function(p) { return [p.latitude, p.longitude]; }));
              map.fitBounds(bounds.pad(0.35), { maxZoom: 15, animate: false, paddingTopLeft: [0, 22] });
            }
            setTimeout(function() { map.invalidateSize(); }, 200);
          } catch (err) {
            console.error('Error init map day ' + dayNum, err);
          }
        });
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTripBookMaps);
      } else {
        initTripBookMaps();
      }
    })();

    window.downloadTripBookPdf = async function(btn, url) {
      if (!btn || btn.disabled) return;
      var originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add('btn-loading');
      btn.innerHTML = '<span class="btn-icon">⏳</span> <span class="btn-text">Baixando PDF...</span>';

      try {
        var response = await fetch(url);
        if (!response.ok) {
          throw new Error('Falha ao baixar PDF (Status ' + response.status + ')');
        }
        var disposition = response.headers.get('content-disposition');
        var filename = 'TripBook.pdf';
        if (disposition && disposition.indexOf('filename=') !== -1) {
          var parts = disposition.split('filename=');
          if (parts[1]) {
            filename = parts[1].split(';')[0].replace(/['"]/g, '').trim();
          }
        }
        var blob = await response.blob();
        var blobUrl = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          window.URL.revokeObjectURL(blobUrl);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 1000);

        btn.classList.remove('btn-loading');
        btn.classList.add('btn-success');
        btn.innerHTML = '<span class="btn-icon">✅</span> <span class="btn-text">Download Concluído!</span>';
        setTimeout(function() {
          btn.classList.remove('btn-success');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 3500);
      } catch (err) {
        console.error('Download error:', err);
        btn.classList.remove('btn-loading');
        btn.classList.add('btn-error');
        btn.innerHTML = '<span class="btn-icon">⚠️</span> <span class="btn-text">Erro ao baixar</span>';
        setTimeout(function() {
          btn.classList.remove('btn-error');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }, 3000);
      }
    };
  </script>
</body>
</html>`;
  },
};
