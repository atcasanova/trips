-- Migration 020: Update trip statuses, eliminating CONFIRMED in favor of PLANNED
-- When trips have timeline alerts they are PLANNING ('Em Planejamento'), when free of alerts they are PLANNED ('Planejada')

UPDATE trips
SET status = 'PLANNED', updated_at = NOW()
WHERE status = 'CONFIRMED';
