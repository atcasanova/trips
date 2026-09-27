-- Migration 008: distingue atrações de áreas visitáveis e registra sua âncora pública.

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS location_kind VARCHAR(20),
  ADD COLUMN IF NOT EXISTS location_anchor_name VARCHAR(255),
  ADD CONSTRAINT itinerary_items_location_kind_check
    CHECK (location_kind IS NULL OR location_kind IN ('PLACE', 'AREA'));

UPDATE itinerary_items
SET location_kind = 'PLACE'
WHERE location_kind IS NULL
  AND location_source = 'OPENAI_WEB_SEARCH'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;
