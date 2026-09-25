-- Migration 004: Expense Splits and Shared Expenses
-- Suporte a despesas compartilhadas vs individuais e divisão de contas (Splitwise / Tricount)

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by_traveler_id UUID REFERENCES trip_travelers(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS split_type VARCHAR(20) NOT NULL DEFAULT 'EQUAL';

CREATE TABLE IF NOT EXISTS expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    traveler_id UUID NOT NULL REFERENCES trip_travelers(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    percentage NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_traveler ON expense_splits(traveler_id);

-- Vincula despesas existentes que possuem paid_by_user_id ao viajante correspondente
UPDATE expenses e
SET paid_by_traveler_id = tt.id
FROM trip_travelers tt
WHERE e.paid_by_traveler_id IS NULL
  AND e.paid_by_user_id IS NOT NULL
  AND tt.trip_id = e.trip_id
  AND tt.user_id = e.paid_by_user_id;

-- Caso ainda seja nulo, vincula ao proprietário da viagem
UPDATE expenses e
SET paid_by_traveler_id = tt.id
FROM trip_travelers tt
WHERE e.paid_by_traveler_id IS NULL
  AND tt.trip_id = e.trip_id
  AND tt.role = 'OWNER';
