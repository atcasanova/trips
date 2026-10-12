import { Request, Response } from 'express';
import { query } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { cleanUrl } from '../utils/urlCleaner.js';
import { scrapeOpenGraph, decodeHtmlEntities } from '../services/openGraphService.js';

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

      // 3. Check for existing duplicate link in this trip
      const { rows: existingLinks } = await query(
        `SELECT id, title, url, image_url, created_at, cities, city, themes, theme, hashtags
         FROM trip_links
         WHERE trip_id = $1 AND (url = $2 OR original_url = $3) AND deleted_at IS NULL
         LIMIT 1`,
        [tripId, cleanedUrl, url.trim()]
      );

      const isDuplicate = existingLinks.length > 0;
      const existingLink = isDuplicate ? existingLinks[0] : null;

      // 4. Scrape OpenGraph metadata
      const og = await scrapeOpenGraph(cleanedUrl);

      return res.json({
        url: cleanedUrl,
        original_url: url.trim(),
        is_duplicate: isDuplicate,
        existing_link: existingLink,
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
    const { q, country, city, cities, theme, themes, hashtag } = req.query;

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
          tl.cities::text ILIKE $${pIdx} OR
          tl.theme ILIKE $${pIdx} OR
          tl.themes::text ILIKE $${pIdx} OR
          tl.hashtags::text ILIKE $${pIdx}
        )`);
      }

      if (country && typeof country === 'string' && country !== 'ALL') {
        params.push(country.trim());
        conditions.push(`tl.country = $${params.length}`);
      }

      // Multi-city filter
      const requestedCities: string[] = [];
      if (typeof cities === 'string' && cities !== 'ALL') {
        cities.split(',').map((c: string) => c.trim()).filter(Boolean).forEach((c: string) => {
          if (!requestedCities.includes(c)) requestedCities.push(c);
        });
      }
      if (typeof city === 'string' && city !== 'ALL') {
        city.split(',').map((c: string) => c.trim()).filter(Boolean).forEach((c: string) => {
          if (!requestedCities.includes(c)) requestedCities.push(c);
        });
      }

      if (requestedCities.length > 0) {
        const cityClauses: string[] = [];
        for (const c of requestedCities) {
          params.push(c);
          const pSingle = params.length;
          params.push(JSON.stringify([c]));
          const pArr = params.length;
          cityClauses.push(`(tl.city = $${pSingle} OR tl.cities @> $${pArr}::jsonb)`);
        }
        conditions.push(`(${cityClauses.join(' OR ')})`);
      }

      // Multi-theme filter
      const requestedThemes: string[] = [];
      if (typeof themes === 'string' && themes !== 'ALL') {
        themes.split(',').map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => {
          if (!requestedThemes.includes(t)) requestedThemes.push(t);
        });
      }
      if (typeof theme === 'string' && theme !== 'ALL') {
        theme.split(',').map((t: string) => t.trim()).filter(Boolean).forEach((t: string) => {
          if (!requestedThemes.includes(t)) requestedThemes.push(t);
        });
      }

      if (requestedThemes.length > 0) {
        const themeClauses: string[] = [];
        for (const t of requestedThemes) {
          params.push(t);
          const pSingle = params.length;
          params.push(JSON.stringify([t]));
          const pArr = params.length;
          themeClauses.push(`(tl.theme = $${pSingle} OR tl.themes @> $${pArr}::jsonb)`);
        }
        conditions.push(`(${themeClauses.join(' OR ')})`);
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
        'SELECT country, city, cities, theme, themes, hashtags FROM trip_links WHERE trip_id = $1 AND deleted_at IS NULL',
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
        if (Array.isArray(l.cities)) {
          l.cities.forEach((c: string) => { if (c) availableCities.add(c); });
        }
        if (l.theme) availableThemes.add(l.theme);
        if (Array.isArray(l.themes)) {
          l.themes.forEach((t: string) => { if (t) availableThemes.add(t); });
        }
        if (Array.isArray(l.hashtags)) {
          l.hashtags.forEach((h: string) => {
            if (h && !/^x[0-9a-f]{2,6}$/i.test(h) && !/^[0-9]+$/.test(h)) {
              availableHashtags.add(h);
            }
          });
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
    const {
      tripId,
    } = req.params;
    const {
      url,
      country,
      city,
      cities,
      theme,
      themes,
      notes,
      custom_title,
      custom_description,
      hashtags,
    } = req.body;

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

      // 3. Check for active duplicate link
      const { rows: existingActive } = await query(
        `SELECT id, title, url, created_at FROM trip_links
         WHERE trip_id = $1 AND (url = $2 OR original_url = $3) AND deleted_at IS NULL
         LIMIT 1`,
        [tripId, cleanedUrl, url.trim()]
      );

      if (existingActive.length > 0) {
        return res.status(409).json({
          error: 'Este link já está cadastrado nesta viagem',
          is_duplicate: true,
          existing_link: existingActive[0],
        });
      }

      // 3. Scrape OpenGraph if needed
      const og = await scrapeOpenGraph(cleanedUrl);

      const finalTitle = decodeHtmlEntities(custom_title?.trim() || og.title || cleanedUrl);
      const finalDescription = decodeHtmlEntities(custom_description?.trim() || og.description || '') || null;
      const finalCountry = country?.trim() || trip.primary_country || null;
      const finalNotes = decodeHtmlEntities(notes?.trim() || '') || null;

      // Handle multiple cities
      let finalCities: string[] = [];
      if (Array.isArray(cities)) {
        finalCities = cities.map((c: any) => String(c).trim()).filter(Boolean);
      } else if (city && typeof city === 'string' && city.trim()) {
        finalCities = [city.trim()];
      }
      finalCities = Array.from(new Set(finalCities));
      const finalCity = finalCities[0] || null;

      // Handle multiple themes
      let finalThemes: string[] = [];
      if (Array.isArray(themes)) {
        finalThemes = themes.map((t: any) => String(t).trim()).filter(Boolean);
      } else if (theme && typeof theme === 'string' && theme.trim()) {
        finalThemes = [theme.trim()];
      }
      if (finalThemes.length === 0) {
        finalThemes = ['Sightseeing'];
      }
      finalThemes = Array.from(new Set(finalThemes));
      const finalTheme = finalThemes[0] || 'Sightseeing';

      let finalHashtags: string[] = og.hashtags || [];
      if (Array.isArray(hashtags) && hashtags.length > 0) {
        finalHashtags = Array.from(
          new Set([
            ...finalHashtags,
            ...hashtags.map((h: string) => decodeHtmlEntities(String(h)).trim().replace(/^#/, '').toLowerCase().trim()),
          ])
        );
      }
      // Filter out entity remainders, pure numeric tags, and ensure word chars
      finalHashtags = finalHashtags.filter(
        (h) => h && !/^x[0-9a-f]{2,6}$/i.test(h) && !/^[0-9]+$/.test(h) && /[\p{L}\p{N}]/u.test(h)
      );

      const insertSql = `
        INSERT INTO trip_links (
          trip_id, user_id, url, original_url, title, description,
          site_name, image_url, video_url, country, city, theme,
          hashtags, metadata, notes, cities, themes
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17
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
        finalNotes,
        JSON.stringify(finalCities),
        JSON.stringify(finalThemes),
      ]);

      return res.status(201).json({ link: created[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Este link já está cadastrado nesta viagem',
          is_duplicate: true,
        });
      }
      logger.error('Erro ao salvar link:', { error: err.message, tripId, url });
      return res.status(500).json({ error: 'Erro ao salvar link' });
    }
  },

  /**
   * Update an existing link
   */
  async updateLink(req: Request, res: Response) {
    const { tripId, linkId } = req.params;
    const {
      title,
      description,
      country,
      city,
      cities,
      theme,
      themes,
      notes,
      hashtags,
    } = req.body;

    try {
      const { rows: existing } = await query(
        'SELECT * FROM trip_links WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
        [linkId, tripId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ error: 'Link não encontrado' });
      }

      const prev = existing[0];
      const newTitle = title !== undefined ? decodeHtmlEntities(title) : prev.title;
      const newDescription = description !== undefined ? decodeHtmlEntities(description) : prev.description;
      const newCountry = country !== undefined ? country : prev.country;
      const newNotes = notes !== undefined ? decodeHtmlEntities(notes) : prev.notes;

      // Handle cities
      let newCities = prev.cities;
      let newCity = prev.city;
      if (cities !== undefined) {
        const arr = Array.isArray(cities)
          ? Array.from(new Set(cities.map((c: any) => String(c).trim()).filter(Boolean)))
          : [];
        newCities = JSON.stringify(arr);
        newCity = arr[0] || null;
      } else if (city !== undefined) {
        newCity = city ? String(city).trim() : null;
        newCities = JSON.stringify(newCity ? [newCity] : []);
      } else {
        newCities = typeof prev.cities === 'string' ? prev.cities : JSON.stringify(prev.cities || []);
      }

      // Handle themes
      let newThemes = prev.themes;
      let newTheme = prev.theme;
      if (themes !== undefined) {
        const arr = Array.isArray(themes)
          ? Array.from(new Set(themes.map((t: any) => String(t).trim()).filter(Boolean)))
          : [];
        newThemes = JSON.stringify(arr);
        newTheme = arr[0] || 'Sightseeing';
      } else if (theme !== undefined) {
        newTheme = theme ? String(theme).trim() : 'Sightseeing';
        newThemes = JSON.stringify(newTheme ? [newTheme] : ['Sightseeing']);
      } else {
        newThemes = typeof prev.themes === 'string' ? prev.themes : JSON.stringify(prev.themes || []);
      }

      let newHashtags = prev.hashtags;
      if (hashtags !== undefined) {
        const cleaned = Array.isArray(hashtags)
          ? hashtags
              .map((h: string) => decodeHtmlEntities(String(h)).trim().replace(/^#/, '').toLowerCase().trim())
              .filter((h) => h && !/^x[0-9a-f]{2,6}$/i.test(h) && !/^[0-9]+$/.test(h) && /[\p{L}\p{N}]/u.test(h))
          : [];
        newHashtags = JSON.stringify(Array.from(new Set(cleaned)));
      } else {
        newHashtags = typeof prev.hashtags === 'string' ? prev.hashtags : JSON.stringify(prev.hashtags || []);
      }

      const updateSql = `
        UPDATE trip_links
        SET title = $1, description = $2, country = $3, city = $4,
            theme = $5, notes = $6, hashtags = $7, cities = $8, themes = $9,
            updated_at = now()
        WHERE id = $10 AND trip_id = $11
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
        newCities,
        newThemes,
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
