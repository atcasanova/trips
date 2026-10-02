-- Migration 017: Expense Transfers and Settlement Payments between Travelers
-- Permite cadastrar transferências (Pix, dinheiro, etc.) feitas diretamente entre participantes para liquidar pendências e equilibrar saldos

CREATE TABLE IF NOT EXISTS expense_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    from_traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
    to_traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50) DEFAULT 'PIX',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_different_travelers CHECK (from_traveler_id <> to_traveler_id),
    CONSTRAINT check_positive_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_expense_transfers_trip ON expense_transfers(trip_id);
CREATE INDEX IF NOT EXISTS idx_expense_transfers_from ON expense_transfers(from_traveler_id);
CREATE INDEX IF NOT EXISTS idx_expense_transfers_to ON expense_transfers(to_traveler_id);
