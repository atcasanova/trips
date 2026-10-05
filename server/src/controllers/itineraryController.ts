import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { refreshItineraryLocations } from '../services/itineraryLocationService.js';
import { aggregateItineraryItems } from '../utils/aggregation.js';
import { tripBookPdfService } from '../services/tripBookPdfService.js';

/**
 * Re-orders all days of a trip chronologically by date and creation time,
 * re-assigning day_number (1..N) and order_index (0..N-1), and updating
 * any auto-generated "Dia X:" prefixes in the day title.
 */
export async function reorderTripDaysChronologically(tripId: string) {
  const { rows: allTripDays } = await query(
    'SELECT id, date, title, day_number FROM trip_days WHERE trip_id = $1 ORDER BY date ASC, created_at ASC',
    [tripId]
  );

  for (let idx = 0; idx < allTripDays.length; idx++) {
    const td = allTripDays[idx];
    const newDayNum = idx + 1;
    const newOrder = idx;

    let updatedTitle = td.title;
    const prefixMatch = (td.title || '').match(/^Dia\s+\d+\s*([:–—-])\s*(.*)$/i);
    if (prefixMatch) {
      updatedTitle = `Dia ${newDayNum}${prefixMatch[1]} ${prefixMatch[2]}`;
    }

    if (td.day_number !== newDayNum || td.title !== updatedTitle) {
      await query(
        'UPDATE trip_days SET day_number = $1, order_index = $2, title = $3, updated_at = NOW() WHERE id = $4',
        [newDayNum, newOrder, updatedTitle, td.id]
      );
    } else {
      await query(
        'UPDATE trip_days SET order_index = $1, updated_at = NOW() WHERE id = $2',
        [newOrder, td.id]
      );
    }
  }

  tripBookPdfService.queuePreGeneration(tripId);
}

export const itineraryController = {
  // 1. List all days and itinerary items for a trip
  async listDays(req: Request, res: Response) {
    const { tripId } = req.params;

    try {
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

      const result = days.map((d: any) => ({
        ...d,
        items: aggregateItineraryItems(itemsByDay[d.id] || []),
      }));

      return res.json({ days: result });
    } catch (err: any) {
      logger.error('Erro ao listar dias do roteiro:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao carregar roteiro' });
    }
  },

  // 2. Create Day
  async createDay(req: Request, res: Response) {
    const { tripId } = req.params;
    const {
      date,
      day_number,
      title,
      subtitle,
      base_location,
      icon,
      narrative,
      temperature_min,
      temperature_max,
      weather_description,
      estimated_cost,
      cost_currency,
      included_services,
      ideas,
      alerts,
      order_index,
    } = req.body;

    if (!date) return res.status(400).json({ error: 'A data do dia é obrigatória' });

    try {
      const { rows } = await query(
        `INSERT INTO trip_days (
          trip_id, date, day_number, title, subtitle, base_location, icon,
          narrative, temperature_min, temperature_max, weather_description,
          estimated_cost, cost_currency, included_services, ideas, alerts, order_index
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          tripId,
          date,
          day_number || 1,
          title || null,
          subtitle || null,
          base_location || null,
          icon || '📍',
          narrative || null,
          temperature_min || null,
          temperature_max || null,
          weather_description || null,
          estimated_cost || null,
          cost_currency || null,
          included_services || null,
          JSON.stringify(ideas || []),
          JSON.stringify(alerts || []),
          order_index || 0,
        ]
      );

      await reorderTripDaysChronologically(tripId);
      const { rows: updatedRows } = await query('SELECT * FROM trip_days WHERE id = $1', [rows[0].id]);

      return res.status(201).json({ day: { ...(updatedRows[0] || rows[0]), items: [] } });
    } catch (err: any) {
      logger.error('Erro ao criar dia do roteiro:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao criar dia no roteiro' });
    }
  },

  // 3. Update Day
  async updateDay(req: Request, res: Response) {
    const { tripId, dayId } = req.params;
    const updates = req.body;

    try {
      const allowed = [
        'date', 'day_number', 'title', 'subtitle', 'base_location', 'icon',
        'narrative', 'temperature_min', 'temperature_max', 'weather_description',
        'estimated_cost', 'cost_currency', 'included_services', 'ideas', 'alerts', 'order_index'
      ];

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const field of allowed) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          let val = updates[field];
          if (['ideas', 'alerts'].includes(field) && typeof val === 'object') {
            val = JSON.stringify(val);
          }
          values.push(val);
        }
      }

      if (setClauses.length === 0) return res.json({ message: 'Nenhuma alteração' });

      setClauses.push(`updated_at = NOW()`);
      values.push(dayId, tripId);

      const sql = `UPDATE trip_days SET ${setClauses.join(', ')} WHERE id = $${idx++} AND trip_id = $${idx} RETURNING *`;
      const { rows } = await query(sql, values);

      if (rows.length === 0) return res.status(404).json({ error: 'Dia não encontrado' });

      if (updates.date !== undefined) {
        await reorderTripDaysChronologically(tripId);
      }

      const { rows: freshRows } = await query('SELECT * FROM trip_days WHERE id = $1', [dayId]);

      const locationRefresh =
        updates.base_location !== undefined
          ? await refreshItineraryLocations({ tripId, dayIds: [dayId], userId: req.user?.id })
          : undefined;

      tripBookPdfService.queuePreGeneration(tripId);

      return res.json({ day: freshRows[0] || rows[0], locationRefresh });
    } catch (err: any) {
      logger.error('Erro ao atualizar dia do roteiro:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao atualizar dia' });
    }
  },

  // 4. Delete Day
  async deleteDay(req: Request, res: Response) {
    const { tripId, dayId } = req.params;
    try {
      await query('DELETE FROM trip_days WHERE id = $1 AND trip_id = $2', [dayId, tripId]);
      await reorderTripDaysChronologically(tripId);
      return res.json({ message: 'Dia removido com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover dia' });
    }
  },

  // 5. Create Itinerary Item
  async createItineraryItem(req: Request, res: Response) {
    const { tripId, dayId } = req.params;
    const {
      title,
      category,
      start_time,
      end_time,
      timezone,
      location_name,
      address,
      latitude,
      longitude,
      duration_text,
      cost_amount,
      cost_currency,
      booking_reference,
      url,
      tips,
      notes,
      order_index,
      map_mode,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'O título da atividade é obrigatório' });

    try {
      const { rows } = await query(
        `INSERT INTO itinerary_items (
          trip_id, trip_day_id, title, category, start_time, end_time, timezone,
          location_name, address, latitude, longitude, duration_text,
          cost_amount, cost_currency, booking_reference, url, tips, notes, order_index, map_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *`,
        [
          tripId,
          dayId,
          title.trim(),
          category || 'ATTRACTION',
          start_time || null,
          end_time || null,
          timezone || null,
          location_name || null,
          address || null,
          latitude || null,
          longitude || null,
          duration_text || null,
          cost_amount || null,
          cost_currency || null,
          booking_reference || null,
          url || null,
          tips || null,
          notes || null,
          order_index || 0,
          map_mode || (category === 'NOTE' ? 'SKIP' : 'AUTO'),
        ]
      );

      let locationRefresh = null;
      if (rows[0].map_mode !== 'SKIP' && rows[0].category !== 'NOTE') {
        locationRefresh = await refreshItineraryLocations({
          tripId,
          itemIds: [rows[0].id],
          userId: req.user?.id,
        });
      }

      tripBookPdfService.queuePreGeneration(tripId);

      return res.status(201).json({ item: rows[0], locationRefresh });
    } catch (err: any) {
      logger.error('Erro ao adicionar atividade ao roteiro:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao adicionar atividade' });
    }
  },

  // 6. Update Itinerary Item
  async updateItineraryItem(req: Request, res: Response) {
    const { tripId, itemId } = req.params;
    const updates = req.body;

    try {
      const allowed = [
        'title', 'category', 'start_time', 'end_time', 'timezone',
        'location_name', 'address', 'latitude', 'longitude', 'duration_text',
        'cost_amount', 'cost_currency', 'booking_reference', 'url', 'tips', 'notes', 'order_index', 'document_id',
        'map_mode'
      ];

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const field of allowed) {
        if (updates[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          values.push(updates[field]);
        }
      }

      if (setClauses.length === 0) return res.json({ message: 'Nenhuma alteração' });

      const changesLocationIdentity = ['title', 'category', 'location_name', 'address'].some(
        (field) => updates[field] !== undefined
      );
      if (changesLocationIdentity) {
        setClauses.push('location_confirmed_at = NULL');
        setClauses.push(`latitude = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE latitude END`);
        setClauses.push(`longitude = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE longitude END`);
        setClauses.push(`location_source = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_source END`);
        setClauses.push(`location_source_url = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_source_url END`);
        setClauses.push(`location_confidence = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_confidence END`);
        setClauses.push(`location_kind = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_kind END`);
        setClauses.push(`location_anchor_name = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_anchor_name END`);
        setClauses.push(`location_verified_at = CASE WHEN location_source = 'OPENAI_WEB_SEARCH' THEN NULL ELSE location_verified_at END`);
      }
      setClauses.push(`updated_at = NOW()`);
      values.push(itemId, tripId);

      const sql = `UPDATE itinerary_items SET ${setClauses.join(', ')} WHERE id = $${idx++} AND trip_id = $${idx} RETURNING *`;
      const { rows } = await query(sql, values);

      if (rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });

      let locationRefresh;
      if (rows[0].category === 'NOTE') {
        await query(
          `UPDATE itinerary_items
           SET latitude = NULL, longitude = NULL, location_source = NULL,
               location_source_url = NULL, location_confidence = NULL,
               location_kind = NULL, location_anchor_name = NULL,
               location_verified_at = NULL, location_confirmed_at = NULL, updated_at = NOW()
           WHERE id = $1 AND trip_id = $2`,
          [itemId, tripId]
        );
      } else if (['title', 'category', 'location_name', 'address'].some((field) => updates[field] !== undefined)) {
        locationRefresh = await refreshItineraryLocations({
          tripId,
          itemIds: [itemId],
          userId: req.user?.id,
        });
      }

      const { rows: fullItem } = await query(
        `SELECT i.*,
                COALESCE(i.document_id, doc.id) AS document_id,
                doc.original_name AS document_name,
                doc.mime_type AS document_mime_type,
                doc.file_size AS document_size
         FROM itinerary_items i
         LEFT JOIN documents doc ON doc.id = COALESCE(i.document_id, (substring(i.notes from '\\[DocID: ([0-9a-fA-F-]{36})\\]'))::uuid) AND doc.deleted_at IS NULL
         WHERE i.id = $1`,
        [itemId]
      );

      tripBookPdfService.queuePreGeneration(tripId);

      return res.json({ item: fullItem[0] || rows[0], locationRefresh });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao atualizar atividade' });
    }
  },

  // 7. Delete Itinerary Item
  async deleteItineraryItem(req: Request, res: Response) {
    const { tripId, itemId } = req.params;
    const deleteDocument = req.query.deleteDocument === 'true' || req.body?.deleteDocument === true;
    try {
      const { rows } = await query('SELECT document_id FROM itinerary_items WHERE id = $1 AND trip_id = $2', [itemId, tripId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Atividade não encontrada' });
      }
      const docId = rows[0]?.document_id;

      await query('DELETE FROM itinerary_items WHERE id = $1 AND trip_id = $2', [itemId, tripId]);
      await query('DELETE FROM itinerary_item_documents WHERE itinerary_item_id = $1', [itemId]);

      if (deleteDocument && docId) {
        await query('UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND trip_id = $2', [docId, tripId]);
        await query('DELETE FROM itinerary_item_documents WHERE document_id = $1', [docId]);
      }

      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({ message: 'Atividade removida com sucesso', deletedDocument: deleteDocument && Boolean(docId) });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao remover atividade' });
    }
  },

  // 8. Move Itinerary Item between days or order
  async moveItem(req: Request, res: Response) {
    const { tripId, itemId } = req.params;
    const { targetDayId, newOrderIndex } = req.body;

    if (!targetDayId) {
      return res.status(400).json({ error: 'O dia de destino é obrigatório' });
    }

    try {
      const orderIdx = typeof newOrderIndex === 'number' ? newOrderIndex : 999;
      const { rows } = await query(
        `UPDATE itinerary_items
         SET trip_day_id = $1, order_index = $2, location_confirmed_at = NULL, updated_at = NOW()
         WHERE id = $3 AND trip_id = $4
         RETURNING *`,
        [targetDayId, orderIdx, itemId, tripId]
      );

      if (rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });

      const locationRefresh = await refreshItineraryLocations({
        tripId,
        itemIds: [itemId],
        userId: req.user?.id,
      });

      tripBookPdfService.queuePreGeneration(tripId);

      return res.json({ item: rows[0], locationRefresh });
    } catch (err: any) {
      logger.error('Erro ao mover atividade:', { error: err.message });
      return res.status(500).json({ error: 'Erro ao mover atividade' });
    }
  },

  // 9. Reorder items in a day
  async reorderItems(req: Request, res: Response) {
    const { tripId } = req.params;
    const { itemIds } = req.body;

    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds deve ser uma lista de IDs' });
    }

    try {
      for (let i = 0; i < itemIds.length; i++) {
        await query(
          'UPDATE itinerary_items SET order_index = $1 WHERE id = $2 AND trip_id = $3',
          [i, itemIds[i], tripId]
        );
      }
      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao reordenar atividades' });
    }
  },

  // 10. Reorder days
  async reorderDays(req: Request, res: Response) {
    const { tripId } = req.params;
    const { dayIds } = req.body;

    if (!Array.isArray(dayIds)) {
      return res.status(400).json({ error: 'dayIds deve ser uma lista de IDs' });
    }

    try {
      for (let i = 0; i < dayIds.length; i++) {
        await query(
          'UPDATE trip_days SET day_number = $1, order_index = $2 WHERE id = $3 AND trip_id = $4',
          [i + 1, i, dayIds[i], tripId]
        );
      }
      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao reordenar dias' });
    }
  },

  // 11. Refresh map locations for existing itinerary entries on demand
  async refreshLocations(req: Request, res: Response) {
    const { tripId } = req.params;
    const { dayId } = req.body || {};

    if (dayId !== undefined && (typeof dayId !== 'string' || !dayId.trim())) {
      return res.status(400).json({ error: 'dayId deve ser um identificador válido.' });
    }

    const locationRefresh = await refreshItineraryLocations({
      tripId,
      userId: req.user?.id,
      dayIds: dayId ? [dayId] : undefined,
    });
    tripBookPdfService.queuePreGeneration(tripId);
    return res.json({ locationRefresh });
  },

  // 12. Confirm or reopen a map point for future location refreshes
  async setLocationConfirmation(req: Request, res: Response) {
    const { tripId, itemId } = req.params;
    const { confirmed } = req.body || {};

    if (typeof confirmed !== 'boolean') {
      return res.status(400).json({ error: 'confirmed deve ser verdadeiro ou falso.' });
    }

    try {
      const { rows } = await query(
        `UPDATE itinerary_items
         SET location_confirmed_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $2
           AND trip_id = $3
           AND category <> 'NOTE'
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND NOT (latitude = 0 AND longitude = 0)
         RETURNING *`,
        [confirmed, itemId, tripId]
      );

      if (rows.length === 0) {
        return res.status(422).json({ error: 'Localize o ponto no mapa antes de confirmá-lo.' });
      }

      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({ item: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao confirmar ponto do mapa:', { error: err.message, tripId, itemId });
      return res.status(500).json({ error: 'Não foi possível alterar a confirmação do ponto.' });
    }
  },

  // 13. Include or exclude an itinerary item from the map and automatic lookup
  async setMapMode(req: Request, res: Response) {
    const { tripId, itemId } = req.params;
    const { mapMode } = req.body || {};

    if (mapMode !== 'AUTO' && mapMode !== 'SKIP') {
      return res.status(400).json({ error: 'mapMode deve ser AUTO ou SKIP.' });
    }

    try {
      const { rows } = await query(
        `UPDATE itinerary_items
         SET map_mode = $1,
             updated_at = NOW()
         WHERE id = $2 AND trip_id = $3
         RETURNING *`,
        [mapMode, itemId, tripId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Item não encontrado.' });
      }

      tripBookPdfService.queuePreGeneration(tripId);
      return res.json({ item: rows[0] });
    } catch (err: any) {
      logger.error('Erro ao alterar visibilidade do item no mapa:', { error: err.message, tripId, itemId });
      return res.status(500).json({ error: 'Não foi possível alterar a visibilidade no mapa.' });
    }
  },
};
