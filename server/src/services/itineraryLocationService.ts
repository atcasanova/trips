import { query } from '../db/pool.js';
import { openaiService, type ItineraryLocationCandidate } from './openaiService.js';
import { logger } from '../utils/logger.js';

interface RefreshItineraryLocationsParams {
  tripId: string;
  userId?: string;
  itemIds?: string[];
  dayIds?: string[];
}

export interface ItineraryLocationRefreshResult {
  candidates: number;
  resolved: number;
  updated: number;
  skippedManualLocations: number;
  skippedConfirmedLocations: number;
  skippedIgnoredLocations: number;
  error?: string;
}

const hasCoordinates = (item: { latitude?: unknown; longitude?: unknown }) => {
  if (
    item.latitude === null || item.latitude === undefined || item.latitude === '' ||
    item.longitude === null || item.longitude === undefined || item.longitude === ''
  ) {
    return false;
  }

  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return (
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
};

function normalizeLocationKey(locationName?: string | null, title?: string | null, baseLocation?: string | null): string {
  const norm = (s?: string | null) =>
    (s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const name = norm(locationName || title);
  const base = norm(baseLocation);
  return `${name}__${base}`;
}

/**
 * Resolves only the itinerary entries affected by an edit. Existing coordinates
 * with a non-OpenAI source are treated as user-provided and never overwritten.
 * If the same location appears multiple times, it is researched only once and applied to all occurrences.
 */
export async function refreshItineraryLocations(
  params: RefreshItineraryLocationsParams
): Promise<ItineraryLocationRefreshResult> {
  try {
    const [{ rows: tripRows }, { rows: itemRows }] = await Promise.all([
      query(
        `SELECT title, destination_summary, primary_country, cities
         FROM trips
         WHERE id = $1 AND deleted_at IS NULL`,
        [params.tripId]
      ),
      query(
        `SELECT
           i.id, i.trip_day_id, i.title, i.category, i.location_name, i.address,
           i.latitude, i.longitude, i.location_source, i.location_confirmed_at, i.map_mode,
           d.title AS day_title, d.day_number, d.base_location
         FROM itinerary_items i
         JOIN trip_days d ON d.id = i.trip_day_id
         WHERE i.trip_id = $1
           AND i.category <> 'NOTE'
         ORDER BY d.date ASC, d.order_index ASC, i.order_index ASC, i.start_time ASC`,
        [params.tripId]
      ),
    ]);

    if (tripRows.length === 0) {
      return {
        candidates: 0,
        resolved: 0,
        updated: 0,
        skippedManualLocations: 0,
        skippedConfirmedLocations: 0,
        skippedIgnoredLocations: 0,
      };
    }

    const requestedItemIds = params.itemIds ? new Set(params.itemIds) : null;
    const requestedDayIds = params.dayIds ? new Set(params.dayIds) : null;
    const items = itemRows.filter((item: any) => {
      if (requestedItemIds && !requestedItemIds.has(item.id)) return false;
      if (requestedDayIds && !requestedDayIds.has(item.trip_day_id)) return false;
      return true;
    });

    const skippedIgnoredLocations = items.filter(
      (item: any) => item.map_mode === 'SKIP'
    ).length;
    const eligibleItems = items.filter((item: any) => item.map_mode !== 'SKIP');
    const skippedConfirmedLocations = eligibleItems.filter(
      (item: any) => Boolean(item.location_confirmed_at)
    ).length;
    const skippedManualLocations = eligibleItems.filter(
      (item: any) => !item.location_confirmed_at && hasCoordinates(item) && item.location_source !== 'OPENAI_WEB_SEARCH'
    ).length;

    // Cache of locations that already have verified/confirmed coordinates in the trip
    const knownLocations = new Map<string, any>();
    for (const item of eligibleItems) {
      if (hasCoordinates(item) && (item.location_confirmed_at || item.location_source !== 'OPENAI_WEB_SEARCH')) {
        const key = normalizeLocationKey(item.location_name, item.title, item.base_location);
        if (key && !knownLocations.has(key)) {
          knownLocations.set(key, item);
        }
      }
    }

    const rawItemsNeedingCoords = eligibleItems.filter(
      (item: any) =>
        !item.location_confirmed_at &&
        (!hasCoordinates(item) || item.location_source === 'OPENAI_WEB_SEARCH')
    );

    // Reuse known verified locations directly if available
    let directlyUpdatedFromKnown = 0;
    const remainingItems: any[] = [];

    for (const item of rawItemsNeedingCoords) {
      const key = normalizeLocationKey(item.location_name, item.title, item.base_location);
      const known = key ? knownLocations.get(key) : null;
      if (known) {
        await query(
          `UPDATE itinerary_items
           SET location_name = COALESCE($1, location_name),
               address = COALESCE($2, address),
               latitude = $3,
               longitude = $4,
               location_source = COALESCE($5, 'OPENAI_WEB_SEARCH'),
               location_source_url = $6,
               location_confidence = COALESCE($7, 0.95),
               location_kind = COALESCE($8, 'PLACE'),
               location_anchor_name = $9,
               location_verified_at = NOW(),
               updated_at = NOW()
           WHERE id = $10 AND trip_id = $11`,
          [
            known.location_name || item.location_name,
            known.address || item.address,
            known.latitude,
            known.longitude,
            known.location_source,
            known.location_source_url || null,
            known.location_confidence,
            known.location_kind,
            known.location_anchor_name || null,
            item.id,
            params.tripId,
          ]
        );
        directlyUpdatedFromKnown += 1;
      } else {
        remainingItems.push(item);
      }
    }

    // Deduplicate candidate locations across the remaining items
    const candidateGroups = new Map<string, { representative: ItineraryLocationCandidate; allItemIds: string[] }>();
    for (const item of remainingItems) {
      const key = normalizeLocationKey(item.location_name, item.title, item.base_location) || `item_${item.id}`;
      if (!candidateGroups.has(key)) {
        candidateGroups.set(key, {
          representative: {
            id: item.id,
            title: item.title,
            category: item.category,
            locationName: item.location_name,
            address: item.address,
            dayTitle: item.day_title,
            dayNumber: item.day_number,
            baseLocation: item.base_location,
          },
          allItemIds: [item.id],
        });
      } else {
        candidateGroups.get(key)!.allItemIds.push(item.id);
      }
    }

    const uniqueCandidates = Array.from(candidateGroups.values()).map((g) => g.representative);

    if (uniqueCandidates.length === 0) {
      await resolveMissingHotelLocations(params.tripId);
      return {
        candidates: rawItemsNeedingCoords.length,
        resolved: directlyUpdatedFromKnown,
        updated: directlyUpdatedFromKnown,
        skippedManualLocations,
        skippedConfirmedLocations,
        skippedIgnoredLocations,
      };
    }

    const trip = tripRows[0];
    const resolution = await openaiService.resolveItineraryLocations({
      tripTitle: trip.title,
      destinationSummary: trip.destination_summary,
      primaryCountry: trip.primary_country,
      cities: Array.isArray(trip.cities) ? trip.cities : [],
      candidates: uniqueCandidates,
      userId: params.userId,
      tripId: params.tripId,
    });

    if (!resolution.success) {
      return {
        candidates: rawItemsNeedingCoords.length,
        resolved: directlyUpdatedFromKnown,
        updated: directlyUpdatedFromKnown,
        skippedManualLocations,
        skippedConfirmedLocations,
        skippedIgnoredLocations,
        error: resolution.error,
      };
    }

    const idToAllIdsMap = new Map<string, string[]>();
    for (const group of candidateGroups.values()) {
      idToAllIdsMap.set(group.representative.id, group.allItemIds);
    }

    let updated = directlyUpdatedFromKnown;
    for (const location of resolution.locations) {
      const targetIds = idToAllIdsMap.get(location.id) || [location.id];
      for (const itemId of targetIds) {
        const { rowCount } = await query(
          `UPDATE itinerary_items
           SET location_name = COALESCE($1, location_name),
               address = COALESCE($2, address),
               latitude = $3,
               longitude = $4,
               location_source = 'OPENAI_WEB_SEARCH',
               location_source_url = $5,
               location_confidence = $6,
               location_kind = $7,
               location_anchor_name = $8,
               location_verified_at = NOW(),
               updated_at = NOW()
           WHERE id = $9 AND trip_id = $10`,
          [
            location.canonicalName,
            location.address,
            location.latitude,
            location.longitude,
            location.sourceUrl,
            location.confidence,
            location.kind,
            location.anchorName,
            itemId,
            params.tripId,
          ]
        );
        updated += rowCount || 0;
      }
    }

    logger.info('Localizações do roteiro atualizadas (com deduplicação)', {
      tripId: params.tripId,
      totalItemsNeedingCoords: rawItemsNeedingCoords.length,
      uniqueCandidatesSent: uniqueCandidates.length,
      directlyUpdatedFromKnown,
      resolvedByAI: resolution.locations.length,
      totalUpdated: updated,
      skippedManualLocations,
      skippedConfirmedLocations,
      skippedIgnoredLocations,
    });

    // Also geocode any hotels that are missing coordinates (with deduplication)
    await resolveMissingHotelLocations(params.tripId);

    return {
      candidates: rawItemsNeedingCoords.length,
      resolved: directlyUpdatedFromKnown + resolution.locations.length,
      updated,
      skippedManualLocations,
      skippedConfirmedLocations,
      skippedIgnoredLocations,
    };
  } catch (err: any) {
    logger.error('Falha ao atualizar localizações do roteiro', {
      tripId: params.tripId,
      error: err.message,
    });
    return {
      candidates: 0,
      resolved: 0,
      updated: 0,
      skippedManualLocations: 0,
      skippedConfirmedLocations: 0,
      skippedIgnoredLocations: 0,
      error: 'Não foi possível atualizar as localizações agora.',
    };
  }
}

/**
 * Automatically locates hotel reservations that do not have coordinates.
 * Deduplicates repeated hotel reservations (e.g. multiple bookings/rooms for the same hotel)
 * so each unique hotel is researched only once.
 */
export async function resolveMissingHotelLocations(tripId: string): Promise<number> {
  try {
    const { rows: hotels } = await query(
      `SELECT id, hotel_name, address, city, country
       FROM hotel_reservations
       WHERE trip_id = $1
         AND (latitude IS NULL OR longitude IS NULL OR (latitude = 0 AND longitude = 0))`,
      [tripId]
    );

    if (hotels.length === 0) return 0;

    const { rows: tripRows } = await query(
      `SELECT title, destination_summary, primary_country, cities FROM trips WHERE id = $1`,
      [tripId]
    );
    const trip = tripRows[0] || {};

    // Group duplicate hotel reservations so identical hotels are only queried once
    const hotelGroups = new Map<string, { representative: ItineraryLocationCandidate; hotelIds: string[] }>();
    for (const h of hotels) {
      const key = normalizeLocationKey(h.hotel_name, h.hotel_name, h.city || h.country);
      if (!hotelGroups.has(key)) {
        hotelGroups.set(key, {
          representative: {
            id: h.id,
            title: h.hotel_name,
            category: 'HOTEL',
            locationName: h.hotel_name,
            address: h.address || h.city || h.country || '',
            baseLocation: h.city || trip.cities?.[0] || '',
          },
          hotelIds: [h.id],
        });
      } else {
        hotelGroups.get(key)!.hotelIds.push(h.id);
      }
    }

    const uniqueHotelCandidates = Array.from(hotelGroups.values()).map((g) => g.representative);

    const resolution = await openaiService.resolveItineraryLocations({
      tripTitle: trip.title || 'Viagem',
      destinationSummary: trip.destination_summary,
      primaryCountry: trip.primary_country,
      cities: Array.isArray(trip.cities) ? trip.cities : [],
      candidates: uniqueHotelCandidates,
      tripId,
    });

    if (!resolution.success) return 0;

    const idToHotelIds = new Map<string, string[]>();
    for (const group of hotelGroups.values()) {
      idToHotelIds.set(group.representative.id, group.hotelIds);
    }

    let updated = 0;
    for (const loc of resolution.locations) {
      if (loc.latitude && loc.longitude && !(loc.latitude === 0 && loc.longitude === 0)) {
        const targetIds = idToHotelIds.get(loc.id) || [loc.id];
        for (const hId of targetIds) {
          const { rowCount } = await query(
            `UPDATE hotel_reservations
             SET latitude = $1, longitude = $2, updated_at = NOW()
             WHERE id = $3 AND trip_id = $4`,
            [loc.latitude, loc.longitude, hId, tripId]
          );
          updated += rowCount || 0;
        }
      }
    }

    if (updated > 0) {
      logger.info('Coordenadas de hotéis atualizadas com sucesso (deduplicadas)', {
        tripId,
        updated,
        uniqueQueried: uniqueHotelCandidates.length,
      });
    }
    return updated;
  } catch (err: any) {
    logger.warn('Erro ao resolver coordenadas de hotéis:', { error: err.message, tripId });
    return 0;
  }
}


