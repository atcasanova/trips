-- Migration 011: adiciona coluna document_id em itinerary_items para rastreabilidade de arquivos importados
ALTER TABLE itinerary_items
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_itinerary_items_document_id
  ON itinerary_items (document_id)
  WHERE document_id IS NOT NULL;

-- Backfill para itens que foram criados a partir de documentos confirmados (marcador [DocID: uuid] em notes)
UPDATE itinerary_items
SET document_id = substring(notes from '\[DocID: ([0-9a-fA-F-]{36})\]')::uuid
WHERE notes LIKE '%[DocID: %'
  AND document_id IS NULL;
