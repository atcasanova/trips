import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

export const reservationController = {
  // === TRANSPORTS ===
  async listTransports(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows: reservations } = await query(
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
    try {
      await query('DELETE FROM transport_reservations WHERE id = $1 AND trip_id = $2', [transportId, tripId]);
      return res.json({ message: 'Transporte excluído com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover transporte' });
    }
  },

  // === HOTELS ===
  async listHotels(req: Request, res: Response) {
    const { tripId } = req.params;
    try {
      const { rows } = await query(
        `SELECT * FROM hotel_reservations WHERE trip_id = $1 ORDER BY check_in_date ASC`,
        [tripId]
      );
      return res.json({ hotels: rows });
    } catch (err: any) {
      logger.error('Erro ao listar hotéis:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao listar hotéis' });
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
          address || null,
          city || null,
          country || null,
          latitude || null,
          longitude || null,
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
          phone || null,
          email || null,
          website || null,
          document_id || null,
          notes || null,
        ]
      );

      return res.status(201).json({ hotel: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao cadastrar hotel:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao cadastrar hospedagem' });
    }
  },

  async deleteHotel(req: Request, res: Response) {
    const { tripId, hotelId } = req.params;
    try {
      await query('DELETE FROM hotel_reservations WHERE id = $1 AND trip_id = $2', [hotelId, tripId]);
      return res.json({ message: 'Hospedagem removida com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover hospedagem' });
    }
  },
};
