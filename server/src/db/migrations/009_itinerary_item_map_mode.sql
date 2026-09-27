-- Migration 009: permite excluir itens do mapa e da pesquisa de localizações.
-- A escolha é reversível: AUTO volta a tornar o item elegível para atualização.

ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS map_mode VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  ADD CONSTRAINT itinerary_items_map_mode_check
    CHECK (map_mode IN ('AUTO', 'SKIP'));

-- Notas nunca representam uma parada cartográfica.
UPDATE itinerary_items
SET map_mode = 'SKIP'
WHERE category = 'NOTE';

CREATE INDEX IF NOT EXISTS idx_itinerary_items_map_mode
  ON itinerary_items (trip_id, map_mode)
  WHERE map_mode = 'SKIP';
