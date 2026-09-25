-- 001_initial_schema.sql: Schema inicial do Trips
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'USER',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    avatar_url TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Trips
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    tagline TEXT,
    description TEXT,
    destination_summary TEXT,
    start_date DATE,
    end_date DATE,
    primary_country VARCHAR(100),
    cities JSONB DEFAULT '[]'::jsonb,
    timezone VARCHAR(100) DEFAULT 'UTC',
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNING',
    theme JSONB DEFAULT '{"preset":"sakura","primary":"#b94a5d","secondary":"#d989a4","accent":"#fdf2f4","text":"#2f3941"}'::jsonb,
    cover_image_url TEXT,
    cover_image_thumb TEXT,
    cover_image_attribution JSONB,
    default_currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trips_created_by ON trips(created_by);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_dates ON trips(start_date, end_date);

-- Trip Members
CREATE TABLE IF NOT EXISTS trip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trip_member UNIQUE(trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id);

-- Trip Days
CREATE TABLE IF NOT EXISTS trip_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_number INT NOT NULL,
    title VARCHAR(255),
    subtitle TEXT,
    base_location VARCHAR(255),
    icon VARCHAR(50) DEFAULT '📍',
    narrative TEXT,
    temperature_min NUMERIC(5,2),
    temperature_max NUMERIC(5,2),
    weather_description TEXT,
    estimated_cost NUMERIC(12,2),
    cost_currency VARCHAR(10),
    included_services TEXT,
    ideas JSONB DEFAULT '[]'::jsonb,
    alerts JSONB DEFAULT '[]'::jsonb,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_days_trip ON trip_days(trip_id, date);

-- Itinerary Items
CREATE TABLE IF NOT EXISTS itinerary_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_day_id UUID NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'ATTRACTION',
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    timezone VARCHAR(100),
    location_name VARCHAR(255),
    address TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    duration_text VARCHAR(100),
    cost_amount NUMERIC(12,2),
    cost_currency VARCHAR(10),
    booking_reference VARCHAR(100),
    url TEXT,
    tips TEXT,
    notes TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_trip_day ON itinerary_items(trip_day_id);

-- Transport Reservations
CREATE TABLE IF NOT EXISTS transport_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'FLIGHT',
    booking_code VARCHAR(100),
    ticket_number VARCHAR(100),
    provider_name VARCHAR(255),
    total_amount NUMERIC(12,2),
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_res_trip ON transport_reservations(trip_id);

-- Transport Segments
CREATE TABLE IF NOT EXISTS transport_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES transport_reservations(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_day_id UUID REFERENCES trip_days(id) ON DELETE SET NULL,
    segment_number INT NOT NULL DEFAULT 1,
    transport_type VARCHAR(50) DEFAULT 'FLIGHT',
    carrier_name VARCHAR(255),
    carrier_code VARCHAR(50),
    identification_number VARCHAR(100),
    departure_location VARCHAR(255),
    departure_station_code VARCHAR(50),
    departure_date DATE,
    departure_time VARCHAR(20),
    departure_timezone VARCHAR(100),
    arrival_location VARCHAR(255),
    arrival_station_code VARCHAR(50),
    arrival_date DATE,
    arrival_time VARCHAR(20),
    arrival_timezone VARCHAR(100),
    duration_minutes INT,
    layover_minutes INT,
    cabin_class VARCHAR(100),
    seat VARCHAR(50),
    baggage_allowance TEXT,
    terminal VARCHAR(50),
    gate VARCHAR(50),
    passenger_names JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transport_segments_res ON transport_segments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_transport_segments_trip ON transport_segments(trip_id);

-- Hotel Reservations
CREATE TABLE IF NOT EXISTS hotel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    hotel_name VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(255),
    country VARCHAR(100),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    check_in_date DATE NOT NULL,
    check_in_time VARCHAR(20),
    check_out_date DATE NOT NULL,
    check_out_time VARCHAR(20),
    reservation_number VARCHAR(100),
    guest_names TEXT,
    room_type VARCHAR(255),
    total_amount NUMERIC(12,2),
    currency VARCHAR(10) DEFAULT 'USD',
    payment_status VARCHAR(50) DEFAULT 'CONFIRMED',
    phone VARCHAR(100),
    email VARCHAR(255),
    website TEXT,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_res_trip ON hotel_reservations(trip_id);

-- Climate & Packing Guides
CREATE TABLE IF NOT EXISTS climate_packing_guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    city_or_period VARCHAR(255) NOT NULL,
    typical_range VARCHAR(255),
    what_to_pack TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_climate_trip ON climate_packing_guides(trip_id);

-- Checklist Items
CREATE TABLE IF NOT EXISTS checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL DEFAULT 'BEFORE_TRIP',
    title VARCHAR(255) NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    due_date DATE,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_trip ON checklist_items(trip_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_name VARCHAR(255) NOT NULL,
    internal_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    ai_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_trip ON documents(trip_id);

-- Document AI Extractions
CREATE TABLE IF NOT EXISTS document_ai_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    detected_type VARCHAR(100) NOT NULL,
    raw_extraction JSONB NOT NULL,
    normalized_data JSONB NOT NULL,
    user_corrections JSONB,
    model_used VARCHAR(100),
    prompt_tokens INT,
    completion_tokens INT,
    duration_ms INT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_ai_doc ON document_ai_extractions(document_id);

-- AI Audit Logs
CREATE TABLE IF NOT EXISTS ai_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    operation VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    request_meta JSONB,
    response_meta JSONB,
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    duration_ms INT,
    status VARCHAR(50) NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_trip ON ai_audit_logs(trip_id);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    trip_day_id UUID REFERENCES trip_days(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
    exchange_rate NUMERIC(12,4) DEFAULT 1.0000,
    amount_default_currency NUMERIC(12,2),
    paid_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) DEFAULT 'CREDIT_CARD',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    cover_image_url TEXT,
    theme_override JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_trip ON reports(trip_id);

-- Report Sections
CREATE TABLE IF NOT EXISTS report_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    section_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_markdown TEXT,
    data_snapshot JSONB,
    order_index INT NOT NULL DEFAULT 0,
    is_included BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_sections_report ON report_sections(report_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_trip ON audit_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
