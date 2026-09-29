-- 010_trip_share_tokens.sql: Adiciona token e flag de compartilhamento público para TripBook
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_trips_share_token ON trips(share_token);
