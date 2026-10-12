-- Migration 023: Add partial unique index to prevent duplicate links in the same trip
-- Ensures that cleaned URL cannot be duplicated within active links of a trip.

-- 1. In case any active duplicate exists, keep only the latest row and soft-delete older duplicates
WITH ranked_links AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY trip_id, url 
               ORDER BY created_at DESC, id DESC
           ) as rn
    FROM trip_links
    WHERE deleted_at IS NULL
)
UPDATE trip_links
SET deleted_at = now()
WHERE id IN (
    SELECT id FROM ranked_links WHERE rn > 1
);

-- 2. Create partial unique index on (trip_id, url) for active links
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_links_unique_trip_url 
ON trip_links (trip_id, url) 
WHERE deleted_at IS NULL;
