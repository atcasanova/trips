-- ==============================================================================
-- Migration 018: Corrigir despesas com paid_by_traveler_id nulo
-- Garante que toda despesa tenha o viajante pagador devidamente associado
-- evitando que despesas compartilhadas criem saldos devedores sem credor.
-- ==============================================================================

-- 1. Associar via paid_by_user_id ao trip_traveler correspondente
UPDATE expenses e
SET paid_by_traveler_id = tt.id
FROM trip_travelers tt
WHERE e.paid_by_traveler_id IS NULL
  AND e.paid_by_user_id IS NOT NULL
  AND tt.trip_id = e.trip_id
  AND tt.user_id = e.paid_by_user_id;

-- 2. Para quaisquer despesas que ainda permaneçam sem pagador, associar ao proprietário (OWNER) da viagem
UPDATE expenses e
SET paid_by_traveler_id = (
  SELECT tt.id
  FROM trip_travelers tt
  WHERE tt.trip_id = e.trip_id
  ORDER BY CASE WHEN tt.role = 'OWNER' THEN 0 ELSE 1 END, tt.created_at ASC
  LIMIT 1
)
WHERE e.paid_by_traveler_id IS NULL;
