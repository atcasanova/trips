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

/**
 * Resolves only the itinerary entries affected by an edit. Existing coordinates
 * with a non-OpenAI source are treated as user-provided and never overwritten.
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
    const candidates: ItineraryLocationCandidate[] = eligibleItems
      .filter(
        (item: any) =>
          !item.location_confirmed_at &&
          (!hasCoordinates(item) || item.location_source === 'OPENAI_WEB_SEARCH')
      )
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        category: item.category,
        locationName: item.location_name,
        address: item.address,
        dayTitle: item.day_title,
        dayNumber: item.day_number,
        baseLocation: item.base_location,
      }));

    if (candidates.length === 0) {
      return {
        candidates: 0,
        resolved: 0,
        updated: 0,
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
      candidates,
      userId: params.userId,
      tripId: params.tripId,
    });

    if (!resolution.success) {
      return {
        candidates: candidates.length,
        resolved: 0,
        updated: 0,
        skippedManualLocations,
        skippedConfirmedLocations,
        skippedIgnoredLocations,
        error: resolution.error,
      };
    }

    let updated = 0;
    for (const location of resolution.locations) {
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
          location.id,
          params.tripId,
        ]
      );
      updated += rowCount || 0;
    }

    logger.info('Localizações do roteiro atualizadas', {
      tripId: params.tripId,
      candidates: candidates.length,
      resolved: resolution.locations.length,
      updated,
      skippedManualLocations,
      skippedConfirmedLocations,
      skippedIgnoredLocations,
    });

    return {
      candidates: candidates.length,
      resolved: resolution.locations.length,
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
