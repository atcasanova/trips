-- Migration 007: confirmações manuais dos pontos do mapa
-- Um ponto confirmado não é reconsultado pela atualização automática/manual
-- até que a confirmação seja removida pelo editor.

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS location_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_confirmed_locations
  ON itinerary_items (trip_id, location_confirmed_at DESC)
  WHERE location_confirmed_at IS NOT NULL;
