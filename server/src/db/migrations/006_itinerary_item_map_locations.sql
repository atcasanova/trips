-- Migration 006: metadata de geocodificação dos pontos do roteiro
-- latitude e longitude já existem em itinerary_items; estas colunas registram
-- a procedência e a confiança de coordenadas encontradas pela busca na web.

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS location_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS location_source_url TEXT,
  ADD COLUMN IF NOT EXISTS location_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS location_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_map_locations
  ON itinerary_items (trip_id, location_verified_at DESC)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
