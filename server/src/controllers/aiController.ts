import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { openaiService } from '../services/openaiService.js';
import { logger } from '../utils/logger.js';

export const aiController = {
  // 1. Generate Narrative for a Day
  async generateDayNarrative(req: Request, res: Response) {
    const { tripId, dayId } = req.params;

    try {
      const { rows: days } = await query('SELECT * FROM trip_days WHERE id = $1 AND trip_id = $2', [dayId, tripId]);
      if (days.length === 0) return res.status(404).json({ error: 'Dia não encontrado' });
      const day = days[0];

      const { rows: items } = await query('SELECT title, location_name FROM itinerary_items WHERE trip_day_id = $1', [dayId]);
      const places = items.map((i: any) => i.location_name || i.title);

      const { rows: trips } = await query('SELECT title, destination_summary, tagline FROM trips WHERE id = $1', [tripId]);
      const trip = trips[0];

      const result = await openaiService.generateDayNarrative({
        dayTitle: day.title || `Dia ${day.day_number}`,
        baseLocation: day.base_location,
        places: places.length > 0 ? places : [day.subtitle || day.base_location || 'Pontos turísticos da cidade'],
        date: day.date,
        tripContext: `${trip?.title || ''} - ${trip?.destination_summary || ''}`,
        userId: req.user?.id,
        tripId,
      });

      // Save generated narrative to the day
      await query('UPDATE trip_days SET narrative = $1, updated_at = NOW() WHERE id = $2', [result.narrative, dayId]);

      return res.json({
        narrative: result.narrative,
        durationMs: result.durationMs,
      });
    } catch (err: any) {
      logger.error('Erro ao gerar narrativa para o dia:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao gerar narrativa' });
    }
  },

  // 2. Generate Pexels search queries based on trip context
  async getPexelsSuggestions(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows } = await query('SELECT title, destination_summary, cities, tagline FROM trips WHERE id = $1', [tripId]);
      if (rows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
      const trip = rows[0];

      const cities = Array.isArray(trip.cities) ? trip.cities : [];
      const queries = await openaiService.generatePexelsQueries({
        title: trip.title,
        destinations: cities.length > 0 ? cities : [trip.destination_summary || trip.title],
        tagline: trip.tagline || undefined,
      });

      return res.json({ queries });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao sugerir termos de busca' });
    }
  },

  // 3. List AI Audit logs
  async listLogs(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
      const { rows } = await query(
        `SELECT l.*, u.name as user_name
         FROM ai_audit_logs l
         LEFT JOIN users u ON l.user_id = u.id
         WHERE l.trip_id = $1
         ORDER BY l.created_at DESC
         LIMIT 100`,
        [tripId]
      );
      return res.json({ logs: rows });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao buscar logs de IA' });
    }
  },

  // 4. Parse freeform itinerary notes into days & items with AI
  async parseItinerary(req: Request, res: Response) {
    const { tripId } = req.params;
    const { text, replaceExisting = false, apply = true } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'O texto do itinerário é obrigatório' });
    }

    try {
      const { rows: trips } = await query(
        'SELECT id, title, start_date, end_date, cities, destination_summary FROM trips WHERE id = $1',
        [tripId]
      );
      if (trips.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
      const trip = trips[0];

      const parsedResult = await openaiService.parseItineraryFromText({
        rawText: text.trim(),
        tripTitle: trip.title,
        tripStartDate: trip.start_date,
        tripEndDate: trip.end_date,
        cities: Array.isArray(trip.cities) ? trip.cities : [],
        userId: req.user?.id,
        tripId,
      });

      if (!apply) {
        return res.json({
          previewOnly: true,
          days: parsedResult.days,
          durationMs: parsedResult.durationMs,
        });
      }

      // If apply === true, persist to database
      if (replaceExisting) {
        await query('DELETE FROM trip_days WHERE trip_id = $1', [tripId]);
      }

      // Find highest existing day number if not replacing
      let startDayNum = 1;
      if (!replaceExisting) {
        const { rows: maxDay } = await query(
          'SELECT COALESCE(MAX(day_number), 0) as max_num FROM trip_days WHERE trip_id = $1',
          [tripId]
        );
        startDayNum = (maxDay[0]?.max_num || 0) + 1;
      }

      let totalDaysCreated = 0;
      let totalItemsCreated = 0;

      for (let i = 0; i < parsedResult.days.length; i++) {
        const d = parsedResult.days[i];
        const dayNumber = replaceExisting ? (d.dayNumber || i + 1) : (startDayNum + i);
        const dayDate = d.date || new Date().toISOString().split('T')[0];

        const { rows: dayRows } = await query(
          `INSERT INTO trip_days (
            trip_id, date, day_number, title, subtitle, base_location, icon, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            tripId,
            dayDate,
            dayNumber,
            d.title || `Dia ${dayNumber}`,
            d.subtitle || null,
            d.baseLocation || null,
            d.icon || '📍',
            i,
          ]
        );

        const dayId = dayRows[0].id;
        totalDaysCreated++;

        if (Array.isArray(d.items)) {
          for (let j = 0; j < d.items.length; j++) {
            const item = d.items[j];
            await query(
              `INSERT INTO itinerary_items (
                trip_id, trip_day_id, title, category, start_time, end_time,
                location_name, address, tips, order_index
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [
                tripId,
                dayId,
                item.title || 'Atividade',
                item.category || 'ATTRACTION',
                item.startTime || null,
                item.endTime || null,
                item.locationName || null,
                item.address || null,
                item.tips || null,
                j,
              ]
            );
            totalItemsCreated++;
          }
        }
      }

      logger.info('Roteiro criado com sucesso via IA', { tripId, totalDaysCreated, totalItemsCreated });

      return res.status(201).json({
        success: true,
        daysCreated: totalDaysCreated,
        itemsCreated: totalItemsCreated,
        parsedDays: parsedResult.days,
      });
    } catch (err: any) {
      logger.error('Erro ao processar roteiro com IA:', { error: err.message });
      return res.status(500).json({ error: err.message || 'Erro ao gerar roteiro com IA' });
    }
  },
};
