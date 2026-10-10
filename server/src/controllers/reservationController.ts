import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { aggregateHotels, extractPassengers } from '../utils/aggregation.js';
import { tripBookPdfService } from '../services/tripBookPdfService.js';
import { resolveMissingHotelLocations } from '../services/itineraryLocationService.js';

export const reservationController = {
  // === TRANSPORTS ===
  async listTransports(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows: reservations } = await query(
        `SELECT tr.*,
                d.original_name as document_name,
                d.user_id as uploader_id,
                u.name as uploader_name,
                u.email as uploader_email,
                e.id as expense_id,
                e.amount as expense_amount,
                e.currency as expense_currency,
                e.description as expense_description
         FROM transport_reservations tr
         LEFT JOIN documents d ON tr.document_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         LEFT JOIN expenses e ON e.trip_id = tr.trip_id AND (
           (tr.document_id IS NOT NULL AND e.document_id = tr.document_id)
           OR (tr.booking_code IS NOT NULL AND tr.booking_code <> '' AND e.description ILIKE '%' || tr.booking_code || '%')
         )
         WHERE tr.trip_id = $1 
         ORDER BY tr.created_at ASC`,
        [tripId]
      );

      const { rows: segments } = await query(
        `SELECT * FROM transport_segments WHERE trip_id = $1 ORDER BY departure_date ASC, departure_time ASC`,
        [tripId]
      );

      const segmentsByRes: Record<string, any[]> = {};
      for (const s of segments) {
        const paxList = extractPassengers(s.passenger_names);
        const enhancedSegment = {
          ...s,
          passengers: paxList,
          passenger_names: paxList,
        };
        if (!segmentsByRes[s.reservation_id]) segmentsByRes[s.reservation_id] = [];
        segmentsByRes[s.reservation_id].push(enhancedSegment);
      }

      const result = reservations.map((r: any) => ({
        ...r,
        segments: segmentsByRes[r.id] || [],
      }));

      return res.json({ transports: result });
    } catch (err: any) {
      logger.error('Erro ao listar transportes:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar transportes' });
    }
  },

  async createTransport(req: Request, res: Response) {
    const { tripId } = req.params;
    const {
      type,
      booking_code,
      ticket_number,
      provider_name,
      total_amount,
      currency,
      status,
      document_id,
      notes,
      segments,
    } = req.body;

    try {
      const { rows } = await query(
        `INSERT INTO transport_reservations (
          trip_id, type, booking_code, ticket_number, provider_name,
          total_amount, currency, status, document_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          tripId,
          type || 'FLIGHT',
          booking_code || null,
          ticket_number || null,
          provider_name || null,
          total_amount || null,
          currency || 'USD',
          status || 'CONFIRMED',
          document_id || null,
          notes || null,
        ]
      );

      const reservation = rows[0];
      const createdSegments: any[] = [];

      if (Array.isArray(segments) && segments.length > 0) {
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i];
          const { rows: segRows } = await query(
            `INSERT INTO transport_segments (
              reservation_id, trip_id, trip_day_id, segment_number, transport_type,
              carrier_name, carrier_code, identification_number,
              departure_location, departure_station_code, departure_date, departure_time, departure_timezone,
              arrival_location, arrival_station_code, arrival_date, arrival_time, arrival_timezone,
              duration_minutes, layover_minutes, cabin_class, seat, baggage_allowance, terminal, gate,
              passenger_names, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
            RETURNING *`,
            [
              reservation.id,
              tripId,
              s.trip_day_id || null,
              i + 1,
              s.transport_type || type || 'FLIGHT',
              s.carrier_name || null,
              s.carrier_code || null,
              s.identification_number || null,
              s.departure_location || 'Origem',
              s.departure_station_code || null,
              s.departure_date || null,
              s.departure_time || null,
              s.departure_timezone || null,
              s.arrival_location || 'Destino',
              s.arrival_station_code || null,
              s.arrival_date || null,
              s.arrival_time || null,
              s.arrival_timezone || null,
              s.duration_minutes || null,
              s.layover_minutes || null,
              s.cabin_class || null,
              s.seat || null,
              s.baggage_allowance || null,
              s.terminal || null,
              s.gate || null,
              JSON.stringify(s.passenger_names || []),
              s.notes || null,
            ]
          );
          createdSegments.push(segRows[0]);
        }
      }

      tripBookPdfService.queuePreGeneration(tripId);

      return res.status(201).json({
        transport: {
          ...reservation,
          segments: createdSegments,
        },
      });
    } catch (err: any) {
      logger.error('Erro ao criar transporte:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cadastrar transporte' });
    }
  },

  async deleteTransport(req: Request, res: Response) {
    const { tripId, transportId } = req.params;
    const deleteDocument = req.query.deleteDocument === 'true' || req.body?.deleteDocument === true;
    const deleteExpense = req.query.deleteExpense === 'true' || req.body?.deleteExpense === true;
    try {
      const { rows } = await query(
        'SELECT document_id, booking_code, provider_name FROM transport_reservations WHERE id = $1 AND trip_id = $2',
        [transportId, tripId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Transporte não encontrado' });
      }
      const docId = rows[0]?.document_id;
      const bookingCode = rows[0]?.booking_code;

      await query('DELETE FROM transport_reservations WHERE id = $1 AND trip_id = $2', [transportId, tripId]);
      await query('DELETE FROM transport_reservation_documents WHERE reservation_id = $1', [transportId]);

      if (deleteDocument && docId) {
        await query('UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND trip_id = $2', [docId, tripId]);
        await query('DELETE FROM transport_reservation_documents WHERE document_id = $1', [docId]);
      }

      if (deleteExpense) {
        if (docId) {
          await query('DELETE FROM expenses WHERE trip_id = $1 AND document_id = $2', [tripId, docId]);
        }
        if (bookingCode) {
          await query(
            "DELETE FROM expenses WHERE trip_id = $1 AND (description ILIKE '%' || $2 || '%' OR notes ILIKE '%' || $2 || '%')",
            [tripId, bookingCode]
          );
        }
      }

      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({
        message: 'Transporte excluído com sucesso',
        deletedDocument: deleteDocument && Boolean(docId),
        deletedExpense: deleteExpense,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover transporte' });
    }
  },

  // === HOTELS ===
  async listHotels(req: Request, res: Response) {
    const { tripId } = req.params;
    try {
      const { rows } = await query(
        `SELECT hr.*, 
                d.original_name as document_name,
                d.user_id as uploader_id,
                u.name as uploader_name,
                u.email as uploader_email,
                e.id as expense_id,
                e.amount as expense_amount,
                e.currency as expense_currency,
                e.description as expense_description
         FROM hotel_reservations hr
         LEFT JOIN documents d ON hr.document_id = d.id
         LEFT JOIN users u ON d.user_id = u.id
         LEFT JOIN expenses e ON e.trip_id = hr.trip_id AND (
           (hr.document_id IS NOT NULL AND e.document_id = hr.document_id)
           OR (hr.reservation_number IS NOT NULL AND hr.reservation_number <> '' AND e.description ILIKE '%' || hr.reservation_number || '%')
         )
         WHERE hr.trip_id = $1 
         ORDER BY hr.check_in_date ASC, hr.created_at ASC`,
        [tripId]
      );
      const aggregated = aggregateHotels(rows);
      return res.json({ hotels: aggregated });
    } catch (err: any) {
      logger.error('Erro ao listar hotéis:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar hotéis' });
    }
  },

  async suggestHotels(req: Request, res: Response) {
    const { tripId } = req.params;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    try {
      const searchPattern = `%${q}%`;
      const { rows } = await query(
        `SELECT 
          hotel_name,
          city,
          country,
          address,
          latitude,
          longitude,
          phone,
          website,
          trip_id
        FROM hotel_reservations
        WHERE hotel_name ILIKE $1
          AND (
            (latitude IS NOT NULL AND longitude IS NOT NULL AND NOT (latitude = 0 AND longitude = 0))
            OR (address IS NOT NULL AND address <> '')
          )
        ORDER BY 
          (trip_id = $2) DESC,
          (latitude IS NOT NULL AND longitude IS NOT NULL) DESC,
          updated_at DESC
        LIMIT 30`,
        [searchPattern, tripId]
      );

      // Deduplica sugestões por nome do hotel e cidade normalizados
      const seen = new Set<string>();
      const suggestions: Array<{
        hotel_name: string;
        city: string | null;
        country: string | null;
        address: string | null;
        latitude: number | null;
        longitude: number | null;
        phone: string | null;
        website: string | null;
        hasCoordinates: boolean;
      }> = [];

      for (const row of rows) {
        const key = `${row.hotel_name.toLowerCase().trim()}|${(row.city || '').toLowerCase().trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const hasCoords = Boolean(
          row.latitude && row.longitude && !(Number(row.latitude) === 0 && Number(row.longitude) === 0)
        );

        suggestions.push({
          hotel_name: row.hotel_name,
          city: row.city || null,
          country: row.country || null,
          address: row.address || null,
          latitude: row.latitude ? Number(row.latitude) : null,
          longitude: row.longitude ? Number(row.longitude) : null,
          phone: row.phone || null,
          website: row.website || null,
          hasCoordinates: hasCoords,
        });

        if (suggestions.length >= 8) break;
      }

      return res.json({ suggestions });
    } catch (err: any) {
      logger.error('Erro ao sugerir hotéis:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao buscar sugestões de hotéis' });
    }
  },

  async createHotel(req: Request, res: Response) {
    const { tripId } = req.params;
    const {
      hotel_name,
      address,
      city,
      country,
      latitude,
      longitude,
      check_in_date,
      check_in_time,
      check_out_date,
      check_out_time,
      reservation_number,
      guest_names,
      room_type,
      total_amount,
      currency,
      payment_status,
      phone,
      email,
      website,
      document_id,
      notes,
    } = req.body;

    if (!hotel_name || !check_in_date || !check_out_date) {
      return res.status(400).json({ error: 'Nome do hotel, data de check-in e check-out são obrigatórios' });
    }

    try {
      let resolvedLat = latitude ? Number(latitude) : null;
      let resolvedLng = longitude ? Number(longitude) : null;
      let resolvedAddress = address ? String(address).trim() : null;
      let resolvedCity = city ? String(city).trim() : null;
      let resolvedCountry = country ? String(country).trim() : null;
      let resolvedPhone = phone ? String(phone).trim() : null;
      let resolvedWebsite = website ? String(website).trim() : null;

      // Se latitude/longitude ou endereço não foram informados manualmente, busca na base de dados de hotéis já conhecidos (system-wide)
      if (!resolvedLat || !resolvedLng || !resolvedAddress) {
        try {
          const { rows: matchRows } = await query(
            `SELECT address, city, country, latitude, longitude, phone, website
             FROM hotel_reservations
             WHERE LOWER(TRIM(hotel_name)) = LOWER(TRIM($1))
               AND (
                 (latitude IS NOT NULL AND longitude IS NOT NULL AND NOT (latitude = 0 AND longitude = 0))
                 OR (address IS NOT NULL AND address <> '')
               )
             ORDER BY (trip_id = $2) DESC,
                      (latitude IS NOT NULL AND longitude IS NOT NULL) DESC,
                      updated_at DESC
             LIMIT 1`,
            [hotel_name.trim(), tripId]
          );

          if (matchRows.length > 0) {
            const match = matchRows[0];
            if (!resolvedLat && !resolvedLng && match.latitude && match.longitude) {
              resolvedLat = Number(match.latitude);
              resolvedLng = Number(match.longitude);
            }
            if (!resolvedAddress && match.address) resolvedAddress = match.address;
            if (!resolvedCity && match.city) resolvedCity = match.city;
            if (!resolvedCountry && match.country) resolvedCountry = match.country;
            if (!resolvedPhone && match.phone) resolvedPhone = match.phone;
            if (!resolvedWebsite && match.website) resolvedWebsite = match.website;
            logger.info(`Dados pré-existentes do hotel "${hotel_name}" reutilizados no cadastro manual`, {
              tripId,
              hasCoords: Boolean(resolvedLat && resolvedLng),
            });
          }
        } catch (matchErr: any) {
          logger.warn('Erro ao consultar hotel pré-existente no cadastro manual:', { error: matchErr.message });
        }
      }

      const { rows } = await query(
        `INSERT INTO hotel_reservations (
          trip_id, hotel_name, address, city, country, latitude, longitude,
          check_in_date, check_in_time, check_out_date, check_out_time,
          reservation_number, guest_names, room_type, total_amount, currency,
          payment_status, phone, email, website, document_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING *`,
        [
          tripId,
          hotel_name.trim(),
          resolvedAddress || null,
          resolvedCity || null,
          resolvedCountry || null,
          resolvedLat || null,
          resolvedLng || null,
          check_in_date,
          check_in_time || null,
          check_out_date,
          check_out_time || null,
          reservation_number || null,
          guest_names || null,
          room_type || null,
          total_amount || null,
          currency || 'USD',
          payment_status || 'CONFIRMED',
          resolvedPhone || null,
          email || null,
          resolvedWebsite || null,
          document_id || null,
          notes || null,
        ]
      );

      tripBookPdfService.queuePreGeneration(tripId);

      if (!resolvedLat || !resolvedLng) {
        resolveMissingHotelLocations(tripId).catch((err: any) =>
          logger.warn(`Erro ao resolver coordenadas do hotel criado: ${err.message}`)
        );
      }

      return res.status(201).json({ hotel: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao cadastrar hotel:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cadastrar hospedagem' });
    }
  },

  async updateHotel(req: Request, res: Response) {
    const { tripId, hotelId } = req.params;
    const {
      hotel_name,
      address,
      city,
      country,
      latitude,
      longitude,
      check_in_date,
      check_in_time,
      check_out_date,
      check_out_time,
      reservation_number,
      guest_names,
      room_type,
      total_amount,
      currency,
      payment_status,
      phone,
      email,
      website,
      notes,
    } = req.body;

    try {
      const { rows: existing } = await query(
        'SELECT * FROM hotel_reservations WHERE id = $1 AND trip_id = $2',
        [hotelId, tripId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Hospedagem não encontrada' });
      }

      const h = existing[0];
      const updatedHotelName = hotel_name !== undefined ? (hotel_name ? String(hotel_name).trim() : h.hotel_name) : h.hotel_name;
      const updatedAddress = address !== undefined ? address : h.address;
      const updatedCity = city !== undefined ? city : h.city;
      const updatedCountry = country !== undefined ? country : h.country;
      const updatedLatitude = latitude !== undefined ? latitude : h.latitude;
      const updatedLongitude = longitude !== undefined ? longitude : h.longitude;
      const updatedCheckIn = check_in_date !== undefined ? check_in_date : h.check_in_date;
      const updatedCheckInTime = check_in_time !== undefined ? check_in_time : h.check_in_time;
      const updatedCheckOut = check_out_date !== undefined ? check_out_date : h.check_out_date;
      const updatedCheckOutTime = check_out_time !== undefined ? check_out_time : h.check_out_time;
      const updatedResNum = reservation_number !== undefined ? reservation_number : h.reservation_number;
      const updatedGuestNames = guest_names !== undefined ? (guest_names ? String(guest_names).trim() : null) : h.guest_names;
      const updatedRoomType = room_type !== undefined ? room_type : h.room_type;
      const updatedTotalAmount = total_amount !== undefined ? total_amount : h.total_amount;
      const updatedCurrency = currency !== undefined ? currency : h.currency;
      const updatedPaymentStatus = payment_status !== undefined ? payment_status : h.payment_status;
      const updatedPhone = phone !== undefined ? phone : h.phone;
      const updatedEmail = email !== undefined ? email : h.email;
      const updatedWebsite = website !== undefined ? website : h.website;
      const updatedNotes = notes !== undefined ? notes : h.notes;

      const { rows } = await query(
        `UPDATE hotel_reservations SET
          hotel_name = $1, address = $2, city = $3, country = $4, latitude = $5, longitude = $6,
          check_in_date = $7, check_in_time = $8, check_out_date = $9, check_out_time = $10,
          reservation_number = $11, guest_names = $12, room_type = $13, total_amount = $14,
          currency = $15, payment_status = $16, phone = $17, email = $18, website = $19,
          notes = $20, updated_at = NOW()
        WHERE id = $21 AND trip_id = $22
        RETURNING *`,
        [
          updatedHotelName,
          updatedAddress,
          updatedCity,
          updatedCountry,
          updatedLatitude,
          updatedLongitude,
          updatedCheckIn,
          updatedCheckInTime,
          updatedCheckOut,
          updatedCheckOutTime,
          updatedResNum,
          updatedGuestNames,
          updatedRoomType,
          updatedTotalAmount,
          updatedCurrency,
          updatedPaymentStatus,
          updatedPhone,
          updatedEmail,
          updatedWebsite,
          updatedNotes,
          hotelId,
          tripId,
        ]
      );

      tripBookPdfService.queuePreGeneration(tripId);

      if (!updatedLatitude || !updatedLongitude) {
        resolveMissingHotelLocations(tripId).catch((err: any) =>
          logger.warn(`Erro ao resolver coordenadas do hotel atualizado: ${err.message}`)
        );
      }

      return res.json({ hotel: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao atualizar hotel:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar hospedagem' });
    }
  },

  async deleteHotel(req: Request, res: Response) {
    const { tripId, hotelId } = req.params;
    const deleteDocument = req.query.deleteDocument === 'true' || req.body?.deleteDocument === true;
    const deleteExpense = req.query.deleteExpense === 'true' || req.body?.deleteExpense === true;
    try {
      const { rows } = await query(
        'SELECT document_id, reservation_number, hotel_name FROM hotel_reservations WHERE id = $1 AND trip_id = $2',
        [hotelId, tripId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Hospedagem não encontrada' });
      }
      const docId = rows[0]?.document_id;
      const resNum = rows[0]?.reservation_number;

      await query('DELETE FROM hotel_reservations WHERE id = $1 AND trip_id = $2', [hotelId, tripId]);
      await query('DELETE FROM hotel_reservation_documents WHERE hotel_id = $1', [hotelId]);

      if (deleteDocument && docId) {
        await query('UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND trip_id = $2', [docId, tripId]);
        await query('DELETE FROM hotel_reservation_documents WHERE document_id = $1', [docId]);
      }

      if (deleteExpense) {
        if (docId) {
          await query('DELETE FROM expenses WHERE trip_id = $1 AND document_id = $2', [tripId, docId]);
        }
        if (resNum) {
          await query(
            "DELETE FROM expenses WHERE trip_id = $1 AND (description ILIKE '%' || $2 || '%' OR notes ILIKE '%' || $2 || '%')",
            [tripId, resNum]
          );
        }
      }

      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({
        message: 'Hospedagem removida com sucesso',
        deletedDocument: deleteDocument && Boolean(docId),
        deletedExpense: deleteExpense,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover hospedagem' });
    }
  },
};
