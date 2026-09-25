-- Migration 002: Trip Travelers & Companions
-- Suporte a participantes registrados e acompanhantes sem conta de usuário

CREATE TABLE IF NOT EXISTS trip_travelers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name VARCHAR(255) NOT NULL,
    ticket_name VARCHAR(255),
    document_number VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'COMPANION',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_travelers_trip ON trip_travelers(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_travelers_user ON trip_travelers(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_travelers_trip_user_uniq ON trip_travelers(trip_id, user_id) WHERE user_id IS NOT NULL;

-- Popula os viajantes a partir dos membros existentes
INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role, created_at, updated_at)
SELECT tm.trip_id, tm.user_id, u.name, u.email, tm.role, tm.created_at, tm.updated_at
FROM trip_members tm
JOIN users u ON u.id = tm.user_id
ON CONFLICT DO NOTHING;

-- Garante que o criador da viagem esteja como viajante principal
INSERT INTO trip_travelers (trip_id, user_id, display_name, email, role, created_at, updated_at)
SELECT t.id, t.created_by, u.name, u.email, 'OWNER', t.created_at, t.updated_at
FROM trips t
JOIN users u ON u.id = t.created_by
WHERE t.created_by IS NOT NULL
ON CONFLICT DO NOTHING;
