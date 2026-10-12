-- Migration 021: Create trip_links table for cataloging social media and web links
CREATE TABLE IF NOT EXISTS trip_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    original_url TEXT,
    title TEXT,
    description TEXT,
    site_name VARCHAR(100),
    image_url TEXT,
    video_url TEXT,
    country VARCHAR(100),
    city VARCHAR(100),
    theme VARCHAR(100),
    hashtags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_trip_links_trip_id ON trip_links(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_links_country ON trip_links(country);
CREATE INDEX IF NOT EXISTS idx_trip_links_city ON trip_links(city);
CREATE INDEX IF NOT EXISTS idx_trip_links_theme ON trip_links(theme);
CREATE INDEX IF NOT EXISTS idx_trip_links_created_at ON trip_links(created_at DESC);
