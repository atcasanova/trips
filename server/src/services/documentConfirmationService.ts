import { query } from '../db/pool.js';
import { openaiService } from './openaiService.js';
import { refreshItineraryLocations } from './itineraryLocationService.js';
import { logger } from '../utils/logger.js';
import { tripBookPdfService } from './tripBookPdfService.js';
import {
  areFlightsMatching,
  areHotelsMatching,
  areItineraryItemsMatching,
  extractPassengers,
  normalizeFlightNumber,
  normalizeText,
} from '../utils/aggregation.js';

export interface TravelerAssociation {
  action: 'IGNORE' | 'CREATE_COMPANION' | 'LINK_USER' | 'LINK_TRAVELER';
  detectedName?: string;
  targetUserId?: string;
  targetTravelerId?: string;
  newCompanionName?: string;
  displayName?: string;
  seat?: string;
  ticketNumber?: string;
}

export interface ConfirmExtractionParams {
  tripId: string;
  documentId: string;
  userId?: string | null;
  confirmedType: string;
  normalizedData: any;
  userCorrections?: any;
  travelerAssociations?: TravelerAssociation[];
}

export async function applyConfirmedExtraction(params: ConfirmExtractionParams): Promise<void> {
  const { tripId, documentId, userId, confirmedType, normalizedData, userCorrections, travelerAssociations } = params;

  // Resolve traveler associations (links to users, existing companions, or new companions)
  const resolvedTravelers: Array<{
    travelerId?: string;
    name: string;
    ticketName?: string;
    seat?: string;
    ticketNumber?: string;
  }> = [];

  if (Array.isArray(travelerAssociations) && travelerAssociations.length > 0) {
    for (const assoc of travelerAssociations) {
      if (assoc.action === 'IGNORE') continue;

      let targetTravelerId = assoc.targetTravelerId;
      let displayName = assoc.newCompanionName || assoc.displayName || assoc.detectedName || 'Viajante';

      if (assoc.action === 'CREATE_COMPANION') {
        const { rows: newComp } = await query(
          `INSERT INTO trip_travelers (
            trip_id, display_name, ticket_name, role, created_by
          ) VALUES ($1, $2, $3, 'COMPANION', $4)
          RETURNING id, display_name`,
          [tripId, displayName.trim(), assoc.detectedName?.trim() || null, userId || null]
        );
        if (newComp.length > 0) {
          targetTravelerId = newComp[0].id;
          displayName = newComp[0].display_name;
        }
      } else if (assoc.action === 'LINK_USER' && assoc.targetUserId) {
        // Find existing traveler for this user or create one
        const { rows: userTraveler } = await query(
          `SELECT id, display_name FROM trip_travelers WHERE trip_id = $1 AND user_id = $2`,
          [tripId, assoc.targetUserId]
        );
        if (userTraveler.length > 0) {
          targetTravelerId = userTraveler[0].id;
          displayName = userTraveler[0].display_name;
          if (assoc.detectedName) {
            await query(`UPDATE trip_travelers SET ticket_name = $1 WHERE id = $2`, [assoc.detectedName, targetTravelerId]);
          }
        } else {
          const { rows: uInfo } = await query('SELECT name, email FROM users WHERE id = $1', [assoc.targetUserId]);
          if (uInfo.length > 0) {
            const { rows: inserted } = await query(
              `INSERT INTO trip_travelers (trip_id, user_id, display_name, ticket_name, email, role, created_by)
               VALUES ($1, $2, $3, $4, $5, 'VIEWER', $6)
               RETURNING id, display_name`,
              [tripId, assoc.targetUserId, uInfo[0].name, assoc.detectedName || null, uInfo[0].email, userId || null]
            );
            targetTravelerId = inserted[0].id;
            displayName = inserted[0].display_name;
          }
        }
      } else if (assoc.action === 'LINK_TRAVELER' && assoc.targetTravelerId) {
        targetTravelerId = assoc.targetTravelerId;
        const { rows: trRows } = await query('SELECT display_name FROM trip_travelers WHERE id = $1', [targetTravelerId]);
        if (trRows.length > 0) {
          displayName = trRows[0].display_name;
          if (assoc.detectedName) {
            await query(`UPDATE trip_travelers SET ticket_name = $1 WHERE id = $2`, [assoc.detectedName, targetTravelerId]);
          }
        }
      }

      resolvedTravelers.push({
        travelerId: targetTravelerId,
        name: displayName,
        ticketName: assoc.detectedName,
        seat: assoc.seat,
        ticketNumber: assoc.ticketNumber,
      });
    }
  } else if (userId) {
    // Auto-resolve travelers when no associations array was provided (e.g. Inbound Email)
    const { rows: userTraveler } = await query(
      `SELECT id, display_name FROM trip_travelers WHERE trip_id = $1 AND user_id = $2`,
      [tripId, userId]
    );

    let mainTravelerId: string | undefined = userTraveler[0]?.id;
    let mainDisplayName: string = userTraveler[0]?.display_name;

    if (!mainTravelerId) {
      const { rows: uInfo } = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
      if (uInfo.length > 0) {
        const { rows: inserted } = await query(
          `INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role, created_by)
           VALUES ($1, $2, $3, $4, 'OWNER', $5)
           RETURNING id, display_name`,
          [tripId, userId, uInfo[0].name, uInfo[0].email, userId]
        );
        mainTravelerId = inserted[0]?.id;
        mainDisplayName = inserted[0]?.display_name;
      }
    }

    const rawPassengers = Array.isArray(normalizedData?.passengers) ? normalizedData.passengers : [];
    if (rawPassengers.length > 0) {
      for (let i = 0; i < rawPassengers.length; i++) {
        const p = rawPassengers[i];
        const pName = typeof p === 'string' ? p : (p.name || p.rawTicketName || 'Passageiro');
        const pTicket = typeof p === 'object' ? (p.rawTicketName || p.ticketName) : undefined;
        const pSeat = typeof p === 'object' ? p.seat : undefined;
        const pTicketNumber = typeof p === 'object' ? p.ticketNumber : undefined;

        if (i === 0) {
          // Link first passenger to the account holder
          if (pTicket && mainTravelerId) {
            await query(`UPDATE trip_travelers SET ticket_name = $1 WHERE id = $2 AND ticket_name IS NULL`, [pTicket, mainTravelerId]);
          }
          resolvedTravelers.push({
            travelerId: mainTravelerId,
            name: mainDisplayName || pName,
            ticketName: pTicket,
            seat: pSeat,
            ticketNumber: pTicketNumber,
          });
        } else {
          // Additional passenger - link or create companion
          const { rows: existingComp } = await query(
            `SELECT id, display_name FROM trip_travelers WHERE trip_id = $1 AND LOWER(display_name) = LOWER($2)`,
            [tripId, pName.trim()]
          );
          let companionId: string;
          if (existingComp.length > 0) {
            companionId = existingComp[0].id;
          } else {
            const { rows: newComp } = await query(
              `INSERT INTO trip_travelers (trip_id, display_name, ticket_name, role, created_by)
               VALUES ($1, $2, $3, 'COMPANION', $4)
               RETURNING id, display_name`,
              [tripId, pName.trim(), pTicket || null, userId]
            );
            companionId = newComp[0].id;
          }
          resolvedTravelers.push({
            travelerId: companionId,
            name: pName,
            ticketName: pTicket,
            seat: pSeat,
            ticketNumber: pTicketNumber,
          });
        }
      }
    } else if (mainDisplayName) {
      resolvedTravelers.push({
        travelerId: mainTravelerId,
        name: mainDisplayName,
      });
    }
  }

  // Update extraction status
  await query(
    `UPDATE document_ai_extractions
     SET status = 'CONFIRMED', user_corrections = $1, normalized_data = $2, updated_at = NOW()
     WHERE document_id = $3 AND trip_id = $4`,
    [JSON.stringify(userCorrections || {}), JSON.stringify(normalizedData), documentId, tripId]
  );

  const data = normalizedData || {};

  // Auto-create reservation based on confirmed type:
  if (confirmedType === 'flight_reservation' || confirmedType === 'FLIGHT') {
    // Create flight reservation
    const { rows: resRows } = await query(
      `INSERT INTO transport_reservations (
        trip_id, type, booking_code, ticket_number, provider_name,
        total_amount, currency, status, document_id, notes
      ) VALUES ($1, 'FLIGHT', $2, $3, $4, $5, $6, 'CONFIRMED', $7, $8)
      RETURNING id`,
      [
        tripId,
        data.reservationCode || null,
        data.ticketNumber || null,
        data.airline || 'Companhia Aérea',
        data.totalAmount || null,
        data.currency || 'USD',
        documentId,
        data.notes || null,
      ]
    );
    const resId = resRows[0].id;
    await query(
      `INSERT INTO transport_reservation_documents (reservation_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [resId, documentId]
    );

    // Create or aggregate segments
    if (Array.isArray(data.segments)) {
      const newPax = resolvedTravelers.length > 0 ? resolvedTravelers : (data.passengers || []);

      for (let i = 0; i < data.segments.length; i++) {
        const seg = data.segments[i];
        const segCandidate = {
          identification_number: seg.flightNumber || null,
          departure_date: seg.departureDate || null,
          departure_time: seg.departureTime || null,
          departure_location: seg.departureCity || seg.departureAirport || 'Origem',
          departure_station_code: seg.departureAirport || null,
          arrival_location: seg.arrivalCity || seg.arrivalAirport || 'Destino',
          arrival_station_code: seg.arrivalAirport || null,
        };

        // Check if there is already a matching flight segment in the trip for the same flight/date
        const { rows: existingSegs } = await query(
          `SELECT s.* FROM transport_segments s
           WHERE s.trip_id = $1 AND (s.departure_date = $2 OR s.departure_date IS NULL)`,
          [tripId, seg.departureDate || null]
        );

        const matchingSeg = existingSegs.find((es) => areFlightsMatching(es, segCandidate));

        if (matchingSeg) {
          // Aggregate passengers into the existing segment
          const currentPax = extractPassengers(matchingSeg.passenger_names);
          for (const cp of currentPax) {
            if (!cp.seat && matchingSeg.seat) cp.seat = matchingSeg.seat;
          }

          for (const np of newPax) {
            const normNp = normalizeText(typeof np === 'string' ? np : np.name);
            const paxObj = typeof np === 'string' ? { name: np } : { ...np };
            if (!paxObj.seat && seg.seat) paxObj.seat = seg.seat;
            if (!paxObj.bookingCode && data.reservationCode) paxObj.bookingCode = data.reservationCode;

            const existingIdx = currentPax.findIndex((cp) => normalizeText(cp.name) === normNp);
            if (existingIdx >= 0) {
              if (!currentPax[existingIdx].seat && paxObj.seat) currentPax[existingIdx].seat = paxObj.seat;
              if (!currentPax[existingIdx].bookingCode && paxObj.bookingCode) currentPax[existingIdx].bookingCode = paxObj.bookingCode;
            } else {
              currentPax.push(paxObj);
            }
          }

          await query(
            `UPDATE transport_segments SET passenger_names = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(currentPax), matchingSeg.id]
          );

          // Also link this document to the existing reservation
          await query(
            `INSERT INTO transport_reservation_documents (reservation_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [matchingSeg.reservation_id, documentId]
          );

          logger.info(`Voo agregado ao trecho existente: ${seg.flightNumber || matchingSeg.identification_number} (${currentPax.length} passageiros)`);
        } else {
          const segPax = newPax.map((np: any) => {
            const paxObj = typeof np === 'string' ? { name: np } : { ...np };
            if (!paxObj.seat && seg.seat) paxObj.seat = seg.seat;
            if (!paxObj.bookingCode && data.reservationCode) paxObj.bookingCode = data.reservationCode;
            return paxObj;
          });

          await query(
            `INSERT INTO transport_segments (
              reservation_id, trip_id, segment_number, transport_type,
              carrier_name, identification_number, departure_location, departure_station_code,
              departure_date, departure_time, departure_timezone, arrival_location, arrival_station_code,
              arrival_date, arrival_time, arrival_timezone, cabin_class, seat, duration_minutes, passenger_names
            ) VALUES ($1, $2, $3, 'FLIGHT', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
              resId,
              tripId,
              i + 1,
              seg.airline || data.airline || null,
              seg.flightNumber || null,
              seg.departureCity || seg.departureAirport || 'Origem',
              seg.departureAirport || null,
              seg.departureDate || null,
              seg.departureTime || null,
              seg.departureTimezone || null,
              seg.arrivalCity || seg.arrivalAirport || 'Destino',
              seg.arrivalAirport || null,
              seg.arrivalDate || null,
              seg.arrivalTime || null,
              seg.arrivalTimezone || null,
              seg.cabin || 'Economy',
              seg.seat || null,
              seg.durationMinutes || null,
              JSON.stringify(segPax),
            ]
          );
        }
      }
    }

    // Se nenhum trecho foi cadastrado nesta reserva (porque todos foram consolidados em reservas existentes),
    // removemos a reserva vazia recém-criada para evitar registros duplicados sem trechos
    const { rows: segCount } = await query(
      `SELECT count(*)::int as count FROM transport_segments WHERE reservation_id = $1`,
      [resId]
    );
    if (segCount.length > 0 && segCount[0].count === 0) {
      await query(`DELETE FROM transport_reservations WHERE id = $1`, [resId]);
      logger.info(`Reserva vazia ${resId} removida pois todos os trechos foram consolidados em trechos existentes.`);
    }

    // Lança/atualiza despesa de transporte se houver valor
    if (data.totalAmount && parseFloat(data.totalAmount) > 0) {
      const expenseDate = (Array.isArray(data.segments) && data.segments[0]?.departureDate) || new Date().toISOString().split('T')[0];
      const desc = `Passagem Aérea: ${data.airline || 'Companhia Aérea'}${data.reservationCode ? ` (${data.reservationCode})` : ''}`;
      const amount = parseFloat(data.totalAmount);
      const curr = data.currency || 'BRL';
      const notes = data.ticketNumber ? `Bilhete: ${data.ticketNumber}` : null;

      await upsertDocumentExpense({
        tripId,
        documentId,
        userId,
        category: 'TRANSPORT',
        description: desc,
        amount,
        currency: curr,
        date: expenseDate,
        notes,
        resolvedTravelers,
      });
    }

    await query(`UPDATE documents SET category = 'FLIGHT' WHERE id = $1`, [documentId]);
  } else if (confirmedType === 'hotel_reservation' || confirmedType === 'HOTEL') {
    const checkIn = data.checkInDate || new Date().toISOString().split('T')[0];
    const checkOut = data.checkOutDate || checkIn;
    const newGuestNames = resolvedTravelers.length > 0 ? resolvedTravelers.map((t) => t.name).join(', ') : (data.guestNames || null);

    // Check if an existing hotel reservation matches this stay
    const { rows: existingHotels } = await query(
      `SELECT * FROM hotel_reservations WHERE trip_id = $1`,
      [tripId]
    );

    const hotelCandidate = {
      hotel_name: data.hotelName || 'Hotel',
      address: data.address || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
    };

    const matchingHotel = existingHotels.find((eh) => areHotelsMatching(eh, hotelCandidate));

    if (matchingHotel) {
      // Merge guest names
      const guestsList: string[] = [];
      const seenG = new Set<string>();
      for (const gStr of [matchingHotel.guest_names, newGuestNames]) {
        if (gStr) {
          gStr.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean).forEach((g: string) => {
            const norm = normalizeText(g);
            if (!seenG.has(norm)) {
              seenG.add(norm);
              guestsList.push(g);
            }
          });
        }
      }
      const mergedGuests = guestsList.join(', ');

      // Merge reservation numbers if both exist and differ
      const resNumbers = [matchingHotel.reservation_number, data.reservationNumber]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);

      await query(
        `UPDATE hotel_reservations
         SET guest_names = $1, reservation_number = $2, updated_at = NOW()
         WHERE id = $3`,
        [mergedGuests, resNumbers.join(', ') || null, matchingHotel.id]
      );

      await query(
        `INSERT INTO hotel_reservation_documents (hotel_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [matchingHotel.id, documentId]
      );

      logger.info(`Hotel agregado à reserva existente: ${matchingHotel.hotel_name} (Hóspedes: ${mergedGuests})`);
    } else {
      // Create hotel reservation
      const { rows: newHotelRows } = await query(
        `INSERT INTO hotel_reservations (
          trip_id, hotel_name, address, city, country,
          check_in_date, check_in_time, check_out_date, check_out_time,
          reservation_number, guest_names, room_type, total_amount, currency,
          payment_status, phone, email, website, document_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id`,
        [
          tripId,
          data.hotelName || 'Hotel',
          data.address || null,
          data.city || null,
          data.country || null,
          checkIn,
          data.checkInTime || '15:00',
          checkOut,
          data.checkOutTime || '11:00',
          data.reservationNumber || null,
          newGuestNames,
          data.roomType || null,
          data.totalAmount || null,
          data.currency || 'USD',
          data.paymentStatus || 'CONFIRMED',
          data.phone || null,
          data.email || null,
          data.website || null,
          documentId,
          data.notes || null,
        ]
      );

      if (newHotelRows.length > 0) {
        await query(
          `INSERT INTO hotel_reservation_documents (hotel_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newHotelRows[0].id, documentId]
        );
      }
    }

    // Lança/atualiza despesa de hospedagem se houver valor
    if (data.totalAmount && parseFloat(data.totalAmount) > 0) {
      const expenseDate = data.checkInDate || new Date().toISOString().split('T')[0];
      const desc = `Hospedagem: ${data.hotelName || 'Hotel'}${data.reservationNumber ? ` (${data.reservationNumber})` : ''}`;
      const amount = parseFloat(data.totalAmount);
      const curr = data.currency || 'BRL';
      const notes = data.reservationNumber ? `Reserva: ${data.reservationNumber}` : null;

      await upsertDocumentExpense({
        tripId,
        documentId,
        userId,
        category: 'ACCOMMODATION',
        description: desc,
        amount,
        currency: curr,
        date: expenseDate,
        notes,
        resolvedTravelers,
      });
    }

    await query(`UPDATE documents SET category = 'HOTEL' WHERE id = $1`, [documentId]);
  } else if (confirmedType === 'activity_ticket' || confirmedType === 'TICKET') {
    const eventTitle = data.title || data.activityName || 'Evento / Show';
    const eventDate = data.eventDate || null;
    const startTime = data.startTime || '20:00';
    const endTime = data.endTime || null;
    const venueName = data.venueName || data.activityName || null;
    let address = data.address || null;
    let lat = data.latitude !== undefined && data.latitude !== null && data.latitude !== '' ? parseFloat(data.latitude) : null;
    let lng = data.longitude !== undefined && data.longitude !== null && data.longitude !== '' ? parseFloat(data.longitude) : null;
    let locationSource = data.locationSource || (lat && lng ? 'OPENAI_WEB_SEARCH' : null);
    let locationSourceUrl = data.locationSourceUrl || null;
    let locationConfidence = data.locationConfidence ? parseFloat(data.locationConfidence) : (lat && lng ? 0.95 : null);

    // Se latitude ou longitude estiverem vazios e houver venueName, tenta geocodificar com web search
    if ((!lat || !lng) && venueName) {
      try {
        logger.info(`Tentando geocodificar local do evento "${venueName}" via web search antes de salvar no roteiro...`);
        let contextCity = data.city;
        let contextCountry = data.country;
        if (!contextCity || !contextCountry) {
          const { rows: tRows } = await query('SELECT primary_country, cities FROM trips WHERE id = $1', [tripId]);
          if (tRows.length > 0) {
            if (!contextCountry) contextCountry = tRows[0].primary_country;
            if (!contextCity && Array.isArray(tRows[0].cities) && tRows[0].cities.length > 0) contextCity = tRows[0].cities[0];
          }
        }
        const geo = await openaiService.resolveEventLocationWithWebSearch({
          venueName,
          city: contextCity,
          country: contextCountry,
          eventTitle,
        });
        if (geo && geo.latitude && geo.longitude) {
          lat = geo.latitude;
          lng = geo.longitude;
          if (!address && geo.address) address = geo.address;
          locationSource = 'OPENAI_WEB_SEARCH';
          locationSourceUrl = geo.sourceUrl || null;
          locationConfidence = geo.confidence || 0.95;
        }
      } catch (geoErr: any) {
        logger.warn(`Falha na busca web de coordenadas do evento: ${geoErr.message}`);
      }
    }

    // Localiza ou cria o dia da viagem (trip_days) correspondente à data do evento
    let targetDayId: string | null = null;
    if (eventDate) {
      const { rows: existingDays } = await query(
        'SELECT id FROM trip_days WHERE trip_id = $1 AND date = $2',
        [tripId, eventDate]
      );

      if (existingDays.length > 0) {
        targetDayId = existingDays[0].id;
      } else {
        let dayIcon = '🎟️';
        if (data.eventType === 'CONCERT' || data.artistOrPerformer) dayIcon = '🎸';
        else if (data.eventType === 'SPORTS_MATCH' || data.teams) dayIcon = '⚽';
        else if (data.eventType === 'THEATER_SHOW') dayIcon = '🎭';
        else if (data.eventType === 'FESTIVAL') dayIcon = '🎪';

        const dayTitle = data.city ? `Dia em ${data.city}` : (venueName || eventTitle);

        const { rows: tripRows } = await query('SELECT start_date FROM trips WHERE id = $1', [tripId]);
        let dayNumber = 1;
        if (tripRows.length > 0 && tripRows[0].start_date) {
          const tripStart = new Date(tripRows[0].start_date).getTime();
          const evDateMs = new Date(eventDate).getTime();
          const diff = Math.round((evDateMs - tripStart) / (1000 * 60 * 60 * 24)) + 1;
          dayNumber = diff > 0 ? diff : 1;
        } else {
          const { rows: maxRows } = await query(
            'SELECT COALESCE(MAX(day_number), 0) + 1 AS next_num FROM trip_days WHERE trip_id = $1',
            [tripId]
          );
          dayNumber = parseInt(maxRows[0].next_num, 10);
        }

        const { rows: newDayRows } = await query(
          `INSERT INTO trip_days (
            trip_id, date, day_number, title, icon, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id`,
          [tripId, eventDate, dayNumber, dayTitle, dayIcon, dayNumber]
        );
        targetDayId = newDayRows[0].id;

        // Reordena e renumera os dias conforme a cronologia
        const { rows: allTripDays } = await query(
          'SELECT id FROM trip_days WHERE trip_id = $1 ORDER BY date ASC',
          [tripId]
        );
        for (let i = 0; i < allTripDays.length; i++) {
          await query(
            'UPDATE trip_days SET day_number = $1, order_index = $2 WHERE id = $3',
            [i + 1, i + 1, allTripDays[i].id]
          );
        }
      }
    } else {
      const { rows: firstDay } = await query(
        'SELECT id FROM trip_days WHERE trip_id = $1 ORDER BY date ASC LIMIT 1',
        [tripId]
      );
      if (firstDay.length > 0) {
        targetDayId = firstDay[0].id;
      }
    }

    // Insere ou atualiza o item no roteiro
    if (targetDayId) {
      const tipsParts: string[] = [];
      if (data.sector) tipsParts.push(`Setor: ${data.sector}`);
      if (data.gate) tipsParts.push(`Portão: ${data.gate}`);
      if (data.seat) tipsParts.push(`Assento: ${data.seat}`);
      if (data.doorsOpenTime) tipsParts.push(`Abertura dos portões: ${data.doorsOpenTime}`);
      if (data.attendeeName) tipsParts.push(`Titular: ${data.attendeeName}`);
      if (data.instructions) tipsParts.push(`Orientações: ${data.instructions}`);
      const tips = tipsParts.length > 0 ? tipsParts.join(' | ') : null;

      const notesParts: string[] = [];
      if (data.competition) notesParts.push(`Competição: ${data.competition}`);
      if (data.artistOrPerformer) notesParts.push(`Artista/Banda: ${data.artistOrPerformer}`);
      if (data.teams && (data.teams.homeTeam || data.teams.awayTeam)) {
        notesParts.push(`Partida: ${data.teams.homeTeam || ''} x ${data.teams.awayTeam || ''}`);
      }
      if (Array.isArray(data.attendees) && data.attendees.length > 0) {
        const attList = data.attendees
          .map((a: any) => `${a.name || 'Participante'}${a.seat ? ` (${a.seat})` : ''}${a.ticketCode ? ` [${a.ticketCode}]` : ''}`)
          .join(', ');
        notesParts.push(`Ingressos: ${attList}`);
      }
      if (data.notes) notesParts.push(data.notes);
      notesParts.push(`[DocID: ${documentId}]`);
      const notes = notesParts.join('\n\n');

      const itemCategory = 'EVENT';
      const bookingRef = data.ticketCode || null;
      const costAmount = data.totalAmount && parseFloat(data.totalAmount) > 0 ? parseFloat(data.totalAmount) : null;
      const costCurrency = data.currency || 'BRL';

      const { rows: existingDocItems } = await query(
        `SELECT * FROM itinerary_items WHERE trip_id = $1 AND (notes LIKE $2 OR document_id = $3)`,
        [tripId, `%[DocID: ${documentId}]%`, documentId]
      );

      let targetItem = existingDocItems.length > 0 ? existingDocItems[0] : null;

      if (!targetItem) {
        const { rows: dayItems } = await query(
          `SELECT * FROM itinerary_items WHERE trip_day_id = $1`,
          [targetDayId]
        );
        const candidate = { title: eventTitle, start_time: startTime, location_name: venueName, address };
        targetItem = dayItems.find((di) => areItineraryItemsMatching(di, candidate)) || null;
      }

      let finalItemId: string;

      if (targetItem) {
        finalItemId = targetItem.id;

        // Merge tips cleanly
        const existingTips = targetItem.tips || '';
        const newTips = tips || '';
        let mergedTips = existingTips;
        if (newTips) {
          if (!existingTips) {
            mergedTips = newTips;
          } else if (!existingTips.includes(newTips)) {
            mergedTips = `${existingTips} | ${newTips}`;
          }
        }

        // Merge notes cleanly (preserve DocID and new notes)
        const existingNotes = targetItem.notes || '';
        const newNotes = notes || '';
        let mergedNotes = existingNotes;
        if (newNotes) {
          if (!existingNotes) {
            mergedNotes = newNotes;
          } else if (!existingNotes.includes(`[DocID: ${documentId}]`)) {
            mergedNotes = `${existingNotes}\n\n${newNotes}`;
          }
        }

        await query(
          `UPDATE itinerary_items
           SET trip_day_id = $1,
               title = COALESCE($2, title),
               category = $3,
               start_time = COALESCE(start_time, $4),
               end_time = COALESCE(end_time, $5),
               location_name = COALESCE(location_name, $6),
               address = COALESCE(address, $7),
               latitude = COALESCE(latitude, $8),
               longitude = COALESCE(longitude, $9),
               location_source = COALESCE(location_source, $10),
               location_source_url = COALESCE(location_source_url, $11),
               location_confidence = COALESCE(location_confidence, $12),
               location_verified_at = COALESCE(location_verified_at, $13),
               location_confirmed_at = COALESCE(location_confirmed_at, $14),
               location_kind = COALESCE(location_kind, $15),
               location_anchor_name = COALESCE(location_anchor_name, $16),
               map_mode = COALESCE(map_mode, 'AUTO'),
               booking_reference = COALESCE(booking_reference, $17),
               tips = $18,
               notes = $19,
               cost_amount = COALESCE(cost_amount, $20),
               cost_currency = COALESCE(cost_currency, $21),
               document_id = COALESCE(document_id, $22),
               updated_at = NOW()
           WHERE id = $23`,
          [
            targetDayId,
            eventTitle,
            itemCategory,
            startTime,
            endTime,
            venueName,
            address,
            lat,
            lng,
            locationSource,
            locationSourceUrl,
            locationConfidence,
            lat && lng ? new Date() : null,
            lat && lng ? new Date() : null,
            lat && lng ? 'PLACE' : null,
            venueName,
            bookingRef,
            mergedTips,
            mergedNotes,
            costAmount,
            costCurrency,
            documentId,
            targetItem.id,
          ]
        );

        await query(
          `INSERT INTO itinerary_item_documents (itinerary_item_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [targetItem.id, documentId]
        );

        logger.info(`Item de roteiro agregado ao item existente: ${targetItem.title} (ID: ${targetItem.id})`);
      } else {
        const { rows: orderRows } = await query(
          `SELECT COALESCE(MAX(order_index), 0) + 1 AS next_order FROM itinerary_items WHERE trip_day_id = $1`,
          [targetDayId]
        );
        const orderIndex = parseInt(orderRows[0].next_order, 10);

        const { rows: newItemRows } = await query(
          `INSERT INTO itinerary_items (
            trip_id, trip_day_id, title, category, start_time, end_time,
            location_name, address, latitude, longitude,
            location_source, location_source_url, location_confidence, location_verified_at, location_confirmed_at,
            location_kind, location_anchor_name, map_mode,
            booking_reference, tips, notes, cost_amount, cost_currency, order_index, document_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'AUTO', $18, $19, $20, $21, $22, $23, $24)
          RETURNING id`,
          [
            tripId,
            targetDayId,
            eventTitle,
            itemCategory,
            startTime,
            endTime,
            venueName,
            address,
            lat,
            lng,
            locationSource,
            locationSourceUrl,
            locationConfidence,
            lat && lng ? new Date() : null,
            lat && lng ? new Date() : null,
            lat && lng ? 'PLACE' : null,
            venueName,
            bookingRef,
            tips,
            notes,
            costAmount,
            costCurrency,
            orderIndex,
            documentId,
          ]
        );
        finalItemId = newItemRows[0].id;

        await query(
          `INSERT INTO itinerary_item_documents (itinerary_item_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [finalItemId, documentId]
        );
      }

      // Se ainda não tiver coordenadas, dispara a busca do roteiro em background apenas para este item
      if (!lat || !lng) {
        refreshItineraryLocations({ tripId, itemIds: [finalItemId] }).catch((err: any) =>
          logger.warn(`Erro no refreshItineraryLocations para item ${finalItemId}: ${err.message}`)
        );
      }
    }

    // Lança/atualiza despesa de atração se houver valor
    if (data.totalAmount && parseFloat(data.totalAmount) > 0) {
      const expenseDate = data.eventDate || new Date().toISOString().split('T')[0];
      const desc = `Ingresso / Evento: ${eventTitle}${data.ticketCode ? ` (${data.ticketCode})` : ''}`;
      const amount = parseFloat(data.totalAmount);
      const curr = data.currency || 'BRL';
      const expNotes = data.ticketCode ? `Código / Ingresso: ${data.ticketCode}` : null;

      await upsertDocumentExpense({
        tripId,
        documentId,
        userId,
        category: 'TICKETS',
        description: desc,
        amount,
        currency: curr,
        date: expenseDate,
        notes: expNotes,
        resolvedTravelers,
      });
    }

    await query(`UPDATE documents SET category = 'TICKET' WHERE id = $1`, [documentId]);
  } else if (confirmedType === 'expense_receipt' || confirmedType === 'RECEIPT') {
    // Lança/atualiza despesa de recibo
    const expCategory = data.category || 'OTHER';
    const expDesc = data.merchantName || 'Despesa comprovada';
    const expAmount = parseFloat(data.totalAmount) || 0;
    const expCurr = data.currency || 'BRL';
    const expMethod = data.paymentMethod || 'CREDIT_CARD';
    const expDate = data.date || new Date().toISOString().split('T')[0];
    const expNotes = data.notes || null;

    if (expAmount > 0) {
      await upsertDocumentExpense({
        tripId,
        documentId,
        userId,
        category: expCategory,
        description: expDesc,
        amount: expAmount,
        currency: expCurr,
        date: expDate,
        notes: expNotes,
        paymentMethod: expMethod,
        resolvedTravelers,
      });
    }

    await query(`UPDATE documents SET category = 'RECEIPT' WHERE id = $1`, [documentId]);
  }

  // Record audit
  await query(
    `INSERT INTO audit_logs (user_id, trip_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'AI_EXTRACTION_CONFIRMED', 'DOCUMENT', $3, $4)`,
    [userId || null, tripId, documentId, JSON.stringify({ confirmedType })]
  );

  // Queue pre-generation of TripBook PDFs
  tripBookPdfService.queuePreGeneration(tripId);
}

async function upsertDocumentExpense(params: {
  tripId: string;
  documentId: string;
  userId?: string | null;
  category: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  notes?: string | null;
  paymentMethod?: string;
  resolvedTravelers: Array<{ travelerId?: string; name: string }>;
  forceShared?: boolean;
}): Promise<void> {
  const {
    tripId,
    documentId,
    userId,
    category,
    description,
    amount,
    currency,
    date,
    notes,
    paymentMethod = 'CREDIT_CARD',
    resolvedTravelers,
    forceShared,
  } = params;

  // Single traveler on reservation = personal expense (is_shared: false)
  // Multiple travelers on reservation = shared expense (is_shared: true)
  const isShared = forceShared !== undefined ? forceShared : resolvedTravelers.length > 1;
  const primaryTravelerId = resolvedTravelers[0]?.travelerId || null;
  const splitType = 'EQUAL';

  const { rows: existingExp } = await query('SELECT id FROM expenses WHERE document_id = $1', [documentId]);
  let expenseId: string;

  if (existingExp.length > 0) {
    expenseId = existingExp[0].id;
    await query(
      `UPDATE expenses 
       SET category = $1, description = $2, amount = $3, currency = $4, payment_method = $5,
           date = $6, notes = $7, is_shared = $8, paid_by_traveler_id = COALESCE($9, paid_by_traveler_id),
           split_type = $10, updated_at = NOW()
       WHERE id = $11`,
      [category, description, amount, currency, paymentMethod, date, notes, isShared, primaryTravelerId, splitType, expenseId]
    );
  } else {
    const { rows: inserted } = await query(
      `INSERT INTO expenses (
        trip_id, category, description, amount, currency, payment_method,
        date, document_id, paid_by_user_id, paid_by_traveler_id, notes,
        is_shared, split_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [tripId, category, description, amount, currency, paymentMethod, date, documentId, userId || null, primaryTravelerId, notes, isShared, splitType]
    );
    expenseId = inserted[0].id;
  }

  // Populate splits
  if (resolvedTravelers.length > 0 && expenseId) {
    await query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
    const splitAmt = Math.round((amount / resolvedTravelers.length) * 100) / 100;
    let sumSoFar = 0;
    for (let i = 0; i < resolvedTravelers.length; i++) {
      const tId = resolvedTravelers[i].travelerId;
      if (!tId) continue;
      const amtToInsert = i === resolvedTravelers.length - 1 ? Math.round((amount - sumSoFar) * 100) / 100 : splitAmt;
      sumSoFar += amtToInsert;
      const pct = Math.round((100 / resolvedTravelers.length) * 100) / 100;
      await query(
        `INSERT INTO expense_splits (expense_id, traveler_id, amount, percentage)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [expenseId, tId, amtToInsert, pct]
      );
    }
  }
}
