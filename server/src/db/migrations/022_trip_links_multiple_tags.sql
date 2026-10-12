-- Migration 022: Multi-tag support for cities and themes in trip_links and entity hashtag cleanup

-- 1. Add cities and themes JSONB columns
ALTER TABLE trip_links ADD COLUMN IF NOT EXISTS cities JSONB DEFAULT '[]'::jsonb;
ALTER TABLE trip_links ADD COLUMN IF NOT EXISTS themes JSONB DEFAULT '[]'::jsonb;

-- 2. Backfill cities from existing city column
UPDATE trip_links
SET cities = jsonb_build_array(city)
WHERE city IS NOT NULL AND city != '' AND (cities IS NULL OR cities = '[]'::jsonb);

-- 3. Backfill themes from existing theme column
UPDATE trip_links
SET themes = jsonb_build_array(theme)
WHERE theme IS NOT NULL AND theme != '' AND (themes IS NULL OR themes = '[]'::jsonb);

-- 4. Create GIN indexes for fast array containment queries
CREATE INDEX IF NOT EXISTS idx_trip_links_cities_gin ON trip_links USING GIN(cities);
CREATE INDEX IF NOT EXISTS idx_trip_links_themes_gin ON trip_links USING GIN(themes);
