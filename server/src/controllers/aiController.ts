import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { openaiService } from '../services/openaiService.js';
import { refreshItineraryLocations } from '../services/itineraryLocationService.js';
import { logger } from '../utils/logger.js';
import { reorderTripDaysChronologically } from './itineraryController.js';
import { tripBookPdfService } from '../services/tripBookPdfService.js';

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

      tripBookPdfService.queuePreGeneration(tripId);

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
    const { text, replaceExisting = false, apply = true, days } = req.body;

    const hasPreParsedDays = Array.isArray(days) && days.length > 0;
    if (!hasPreParsedDays && (!text || typeof text !== 'string' || text.trim().length === 0)) {
      return res.status(400).json({ error: 'O texto do itinerário ou os dias analisados são obrigatórios' });
    }

    try {
      const { rows: trips } = await query(
        'SELECT id, title, start_date, end_date, cities, destination_summary FROM trips WHERE id = $1',
        [tripId]
      );
      if (trips.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
      const trip = trips[0];

      // Fetch existing days with items for context
      const { rows: existingDayRows } = await query(
        `SELECT td.id, td.day_number, td.date, td.title, td.base_location,
                COALESCE(
                  json_agg(
                    json_build_object('title', ii.title, 'category', ii.category, 'location_name', ii.location_name)
                  ) FILTER (WHERE ii.id IS NOT NULL), '[]'
                ) as items
         FROM trip_days td
         LEFT JOIN itinerary_items ii ON ii.trip_day_id = td.id
         WHERE td.trip_id = $1
         GROUP BY td.id, td.day_number, td.date, td.title, td.base_location
         ORDER BY td.date ASC, td.day_number ASC`,
        [tripId]
      );

      let parsedDays = hasPreParsedDays ? days : null;
      let durationMs = 0;

      if (!parsedDays) {
        const existingDaysContext = existingDayRows.map((r: any) => ({
          dayNumber: r.day_number,
          date: r.date ? (typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0]) : undefined,
          title: r.title,
          baseLocation: r.base_location,
          items: r.items || [],
        }));

        const parsedResult = await openaiService.parseItineraryFromText({
          rawText: text.trim(),
          tripTitle: trip.title,
          tripStartDate: trip.start_date ? (typeof trip.start_date === 'string' ? trip.start_date.split('T')[0] : new Date(trip.start_date).toISOString().split('T')[0]) : null,
          tripEndDate: trip.end_date ? (typeof trip.end_date === 'string' ? trip.end_date.split('T')[0] : new Date(trip.end_date).toISOString().split('T')[0]) : null,
          cities: Array.isArray(trip.cities) ? trip.cities : [],
          existingDays: existingDaysContext,
          userId: req.user?.id,
          tripId,
        });
        parsedDays = parsedResult.days;
        durationMs = parsedResult.durationMs;
      }

      // Check against existing days by date to enrich parsedDays for preview
      const existingDateMap = new Map<string, any>();
      for (const ed of existingDayRows) {
        if (ed.date) {
          const dateStr = typeof ed.date === 'string' ? ed.date.split('T')[0] : new Date(ed.date).toISOString().split('T')[0];
          existingDateMap.set(dateStr, ed);
        }
      }

      parsedDays = parsedDays.map((d: any) => {
        const dDate = d.date ? (typeof d.date === 'string' ? d.date.split('T')[0] : new Date(d.date).toISOString().split('T')[0]) : null;
        const match = dDate ? existingDateMap.get(dDate) : null;
        return {
          ...d,
          date: dDate,
          isExistingDay: !replaceExisting && !!match,
          existingDayNumber: match ? match.day_number : undefined,
          existingDayTitle: match ? match.title : undefined,
          existingDayId: match ? match.id : undefined,
        };
      });

      if (!apply) {
        return res.json({
          previewOnly: true,
          days: parsedDays,
          durationMs,
        });
      }

      // If apply === true, persist to database
      if (replaceExisting) {
        await query('DELETE FROM trip_days WHERE trip_id = $1', [tripId]);
      }

      let totalDaysCreated = 0;
      let totalDaysMerged = 0;
      let totalItemsCreated = 0;
      const createdItemIds: string[] = [];

      for (let i = 0; i < parsedDays.length; i++) {
        const d = parsedDays[i];
        const dayDate = d.date || new Date().toISOString().split('T')[0];

        let targetDayId: string | null = null;

        // If not replacing, check if this date already exists
        if (!replaceExisting) {
          const { rows: matchRows } = await query(
            'SELECT id, title, subtitle, base_location FROM trip_days WHERE trip_id = $1 AND date = $2 ORDER BY day_number ASC LIMIT 1',
            [tripId, dayDate]
          );
          if (matchRows.length > 0) {
            targetDayId = matchRows[0].id;
            totalDaysMerged++;
            // Update base_location or subtitle if currently empty
            if (!matchRows[0].base_location && d.baseLocation) {
              await query('UPDATE trip_days SET base_location = $1, updated_at = NOW() WHERE id = $2', [d.baseLocation, targetDayId]);
            }
            if (!matchRows[0].subtitle && d.subtitle) {
              await query('UPDATE trip_days SET subtitle = $1, updated_at = NOW() WHERE id = $2', [d.subtitle, targetDayId]);
            }
          }
        }

        if (!targetDayId) {
          const { rows: dayRows } = await query(
            `INSERT INTO trip_days (
              trip_id, date, day_number, title, subtitle, base_location, icon, order_index
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id`,
            [
              tripId,
              dayDate,
              d.dayNumber || (i + 1),
              d.title || `Dia ${d.dayNumber || (i + 1)}`,
              d.subtitle || null,
              d.baseLocation || null,
              d.icon || '📍',
              i,
            ]
          );
          targetDayId = dayRows[0].id;
          totalDaysCreated++;
        }

        if (Array.isArray(d.items) && targetDayId) {
          // Get existing items for this day to avoid duplicate titles and determine order_index
          const { rows: existingItems } = await query(
            'SELECT LOWER(TRIM(title)) as norm_title, COALESCE(MAX(order_index), -1) as max_order FROM itinerary_items WHERE trip_day_id = $1 GROUP BY id, title, order_index',
            [targetDayId]
          );
          const existingNormTitles = new Set(existingItems.map((r: any) => r.norm_title));
          let currentMaxOrder = existingItems.reduce((acc: number, r: any) => Math.max(acc, Number(r.max_order) || -1), -1);

          for (let j = 0; j < d.items.length; j++) {
            const item = d.items[j];
            const normTitle = (item.title || '').trim().toLowerCase();

            // If merging into an existing day and an item with the same title already exists, skip it
            if (normTitle && existingNormTitles.has(normTitle)) {
              continue;
            }
            if (normTitle) {
              existingNormTitles.add(normTitle);
            }
            currentMaxOrder++;

            const { rows: itemRows } = await query(
              `INSERT INTO itinerary_items (
                trip_id, trip_day_id, title, category, start_time, end_time,
                location_name, address, tips, map_mode, order_index
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING id`,
              [
                tripId,
                targetDayId,
                item.title || 'Atividade',
                item.category || 'ATTRACTION',
                item.startTime || null,
                item.endTime || null,
                item.locationName || null,
                item.address || null,
                item.tips || null,
                item.mapMode === 'SKIP' || item.category === 'NOTE' ? 'SKIP' : 'AUTO',
                currentMaxOrder,
              ]
            );
            createdItemIds.push(itemRows[0].id);
            totalItemsCreated++;
          }
        }
      }

      // Re-order all days strictly chronologically!
      await reorderTripDaysChronologically(tripId);

      const locationRefresh = await refreshItineraryLocations({
        tripId,
        itemIds: createdItemIds,
        userId: req.user?.id,
      });

      logger.info('Roteiro processado com sucesso via IA', {
        tripId,
        totalDaysCreated,
        totalDaysMerged,
        totalItemsCreated,
        locationRefresh,
      });

      return res.status(201).json({
        success: true,
        daysCreated: totalDaysCreated,
        daysMerged: totalDaysMerged,
        itemsCreated: totalItemsCreated,
        parsedDays,
        locationRefresh,
      });
    } catch (err: any) {
      logger.error('Erro ao processar roteiro com IA:', { error: err.message });
      return res.status(500).json({ error: err.message || 'Erro ao gerar roteiro com IA' });
    }
  },
};
