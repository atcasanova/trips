import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { cleanUrl } from '../utils/urlCleaner.js';
import { scrapeOpenGraph } from '../services/openGraphService.js';

export const linkController = {
  /**
   * Preview link: Cleans URL, scrapes OpenGraph tags, and gets trip destinations
   */
  async previewLink(req: Request, res: Response) {
    const { tripId } = req.params;
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
      // 1. Clean URL using tracking cleaner and Instagram heuristic
      const cleanedUrl = cleanUrl(url);

      // 2. Fetch trip info for default country and cities
      const { rows: trips } = await query(
        'SELECT id, primary_country, cities, destination_summary FROM trips WHERE id = $1 AND deleted_at IS NULL',
        [tripId]
      );

      if (trips.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }

      const trip = trips[0];
      let cities: string[] = [];
      if (Array.isArray(trip.cities)) {
        cities = trip.cities;
      } else if (typeof trip.cities === 'string') {
        try {
          cities = JSON.parse(trip.cities);
        } catch {
          cities = [];
        }
      }

      if (cities.length === 0 && trip.destination_summary) {
        cities = trip.destination_summary
          .split(/[,•|]/)
          .map((c: string) => c.trim())
          .filter(Boolean);
      }

      // 3. Scrape OpenGraph metadata
      const og = await scrapeOpenGraph(cleanedUrl);

      return res.json({
        url: cleanedUrl,
        original_url: url.trim(),
        og,
        trip_destinations: {
          primary_country: trip.primary_country || null,
          cities: Array.from(new Set(cities)),
        },
      });
    } catch (err: any) {
      logger.error('Erro ao pré-visualizar link:', { error: err.message, tripId, url });
      return res.status(500).json({ error: 'Erro ao analisar link' });
    }
  },

  /**
   * List links with search & filter
   */
  async getTripLinks(req: Request, res: Response) {
    const { tripId } = req.params;
    const { q, country, city, theme, hashtag } = req.query;

    try {
      // 1. Verify trip exists
      const { rows: trips } = await query(
        'SELECT id, primary_country, cities, destination_summary FROM trips WHERE id = $1 AND deleted_at IS NULL',
        [tripId]
      );
      if (trips.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }
      const trip = trips[0];

      // 2. Build search query
      const conditions: string[] = ['tl.trip_id = $1', 'tl.deleted_at IS NULL'];
      const params: any[] = [tripId];

      // Substring search on text fields
      if (q && typeof q === 'string' && q.trim()) {
        params.push(`%${q.trim()}%`);
        const pIdx = params.length;
        conditions.push(`(
          tl.title ILIKE $${pIdx} OR
          tl.description ILIKE $${pIdx} OR
          tl.url ILIKE $${pIdx} OR
          tl.notes ILIKE $${pIdx} OR
          tl.site_name ILIKE $${pIdx} OR
          tl.country ILIKE $${pIdx} OR
          tl.city ILIKE $${pIdx} OR
          tl.theme ILIKE $${pIdx} OR
          tl.hashtags::text ILIKE $${pIdx}
        )`);
      }

      if (country && typeof country === 'string' && country !== 'ALL') {
        params.push(country.trim());
        conditions.push(`tl.country = $${params.length}`);
      }

      if (city && typeof city === 'string' && city !== 'ALL') {
        params.push(city.trim());
        conditions.push(`tl.city = $${params.length}`);
      }

      if (theme && typeof theme === 'string' && theme !== 'ALL') {
        params.push(theme.trim());
        conditions.push(`tl.theme = $${params.length}`);
      }

      if (hashtag && typeof hashtag === 'string' && hashtag.trim() && hashtag !== 'ALL') {
        const cleanTag = hashtag.trim().replace(/^#/, '').toLowerCase();
        params.push(`%"${cleanTag}"%`);
        conditions.push(`tl.hashtags::text ILIKE $${params.length}`);
      }

      const sql = `
        SELECT tl.*, u.name as added_by_name, u.avatar_url as added_by_avatar
        FROM trip_links tl
        LEFT JOIN users u ON tl.user_id = u.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY tl.created_at DESC
      `;

      const { rows: links } = await query(sql, params);

      // 3. Compute available filter options across all active links of this trip
      const { rows: allLinks } = await query(
        'SELECT country, city, theme, hashtags FROM trip_links WHERE trip_id = $1 AND deleted_at IS NULL',
        [tripId]
      );

      const availableCountries = new Set<string>();
      if (trip.primary_country) availableCountries.add(trip.primary_country);

      const availableCities = new Set<string>();
      let baseCities: string[] = [];
      if (Array.isArray(trip.cities)) baseCities = trip.cities;
      else if (typeof trip.cities === 'string') {
        try { baseCities = JSON.parse(trip.cities); } catch {}
      }
      baseCities.forEach((c) => availableCities.add(c));

      const availableThemes = new Set<string>();
      const availableHashtags = new Set<string>();

      for (const l of allLinks) {
        if (l.country) availableCountries.add(l.country);
        if (l.city) availableCities.add(l.city);
        if (l.theme) availableThemes.add(l.theme);
        if (Array.isArray(l.hashtags)) {
          l.hashtags.forEach((h: string) => availableHashtags.add(h));
        }
      }

      return res.json({
        links,
        available_filters: {
          countries: Array.from(availableCountries).filter(Boolean).sort(),
          cities: Array.from(availableCities).filter(Boolean).sort(),
          themes: Array.from(availableThemes).filter(Boolean).sort(),
          hashtags: Array.from(availableHashtags).filter(Boolean).sort(),
        },
      });
    } catch (err: any) {
      logger.error('Erro ao listar links da viagem:', { error: err.message, tripId });
      return res.status(500).json({ error: 'Erro ao carregar links da viagem' });
    }
  },

  /**
   * Create a new link
   */
  async createLink(req: Request, res: Response) {
    const { tripId } = req.params;
    const { url, country, city, theme, notes, custom_title, custom_description, hashtags } = req.body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
      // 1. Clean URL
      const cleanedUrl = cleanUrl(url);

      // 2. Fetch trip info for default country
      const { rows: trips } = await query(
        'SELECT id, primary_country FROM trips WHERE id = $1 AND deleted_at IS NULL',
        [tripId]
      );
      if (trips.length === 0) {
        return res.status(404).json({ error: 'Viagem não encontrada' });
      }
      const trip = trips[0];

      // 3. Scrape OpenGraph if needed
      const og = await scrapeOpenGraph(cleanedUrl);

      const finalTitle = custom_title?.trim() || og.title || cleanedUrl;
      const finalDescription = custom_description?.trim() || og.description || null;
      const finalCountry = country?.trim() || trip.primary_country || null;
      const finalCity = city?.trim() || null;
      const finalTheme = theme?.trim() || 'Sightseeing';

      let finalHashtags: string[] = og.hashtags || [];
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        finalHashtags = Array.from(new Set([...finalHashtags, ...hashtags.map((h: string) => h.replace(/^#/, '').toLowerCase())]));
      }

      const insertSql = `
        INSERT INTO trip_links (
          trip_id, user_id, url, original_url, title, description,
          site_name, image_url, video_url, country, city, theme,
          hashtags, metadata, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15
        )
        RETURNING *
      `;

      const { rows: created } = await query(insertSql, [
        tripId,
        req.user?.id || null,
        cleanedUrl,
        url.trim(),
        finalTitle,
        finalDescription,
        og.site_name,
        og.image_url,
        og.video_url,
        finalCountry,
        finalCity,
        finalTheme,
        JSON.stringify(finalHashtags),
        JSON.stringify(og.metadata || {}),
        notes?.trim() || null,
      ]);

      return res.status(201).json({ link: created[0] });
    } catch (err: any) {
      logger.error('Erro ao salvar link:', { error: err.message, tripId, url });
      return res.status(500).json({ error: 'Erro ao salvar link' });
    }
  },

  /**
   * Update an existing link
   */
  async updateLink(req: Request, res: Response) {
    const { tripId, linkId } = req.params;
    const { title, description, country, city, theme, notes, hashtags } = req.body;

    try {
      const { rows: existing } = await query(
        'SELECT * FROM trip_links WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
        [linkId, tripId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Link não encontrado' });
      }

      const prev = existing[0];
      const newTitle = title !== undefined ? title : prev.title;
      const newDescription = description !== undefined ? description : prev.description;
      const newCountry = country !== undefined ? country : prev.country;
      const newCity = city !== undefined ? city : prev.city;
      const newTheme = theme !== undefined ? theme : prev.theme;
      const newNotes = notes !== undefined ? notes : prev.notes;
      const newHashtags = hashtags !== undefined ? JSON.stringify(hashtags) : prev.hashtags;

      const updateSql = `
        UPDATE trip_links
        SET title = $1, description = $2, country = $3, city = $4,
            theme = $5, notes = $6, hashtags = $7, updated_at = now()
        WHERE id = $8 AND trip_id = $9
        RETURNING *
      `;

      const { rows: updated } = await query(updateSql, [
        newTitle,
        newDescription,
        newCountry,
        newCity,
        newTheme,
        newNotes,
        newHashtags,
        linkId,
        tripId,
      ]);

      return res.json({ link: updated[0] });
    } catch (err: any) {
      logger.error('Erro ao atualizar link:', { error: err.message, tripId, linkId });
      return res.status(500).json({ error: 'Erro ao atualizar link' });
    }
  },

  /**
   * Delete a link
   */
  async deleteLink(req: Request, res: Response) {
    const { tripId, linkId } = req.params;

    try {
      const { rowCount } = await query(
        'UPDATE trip_links SET deleted_at = now() WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
        [linkId, tripId]
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'Link não encontrado' });
      }

      return res.json({ success: true, message: 'Link excluído com sucesso' });
    } catch (err: any) {
      logger.error('Erro ao excluir link:', { error: err.message, tripId, linkId });
      return res.status(500).json({ error: 'Erro ao excluir link' });
    }
  },
};
