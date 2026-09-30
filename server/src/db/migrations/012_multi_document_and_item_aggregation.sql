-- Migration 012: Suporte a múltiplos documentos por item de roteiro, transporte e hotel, e agregação de dados
CREATE TABLE IF NOT EXISTS itinerary_item_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_item_id UUID NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_itinerary_item_documents UNIQUE (itinerary_item_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_item_documents_item ON itinerary_item_documents(itinerary_item_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_item_documents_doc ON itinerary_item_documents(document_id);

CREATE TABLE IF NOT EXISTS transport_reservation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES transport_reservations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_transport_res_documents UNIQUE (reservation_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_res_documents_res ON transport_reservation_documents(reservation_id);
CREATE INDEX IF NOT EXISTS idx_transport_res_documents_doc ON transport_reservation_documents(document_id);

CREATE TABLE IF NOT EXISTS hotel_reservation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hotel_res_documents UNIQUE (hotel_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_res_documents_hotel ON hotel_reservation_documents(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_res_documents_doc ON hotel_reservation_documents(document_id);

-- Backfill para itinerary_item_documents a partir de document_id e notes
INSERT INTO itinerary_item_documents (itinerary_item_id, document_id)
SELECT i.id, i.document_id
FROM itinerary_items i
JOIN documents d ON d.id = i.document_id
WHERE i.document_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO itinerary_item_documents (itinerary_item_id, document_id)
SELECT i.id, (substring(i.notes from '\[DocID: ([0-9a-fA-F-]{36})\]'))::uuid
FROM itinerary_items i
JOIN documents d ON d.id = (substring(i.notes from '\[DocID: ([0-9a-fA-F-]{36})\]'))::uuid
WHERE i.notes LIKE '%[DocID: %'
ON CONFLICT DO NOTHING;

-- Backfill para transport_reservation_documents
INSERT INTO transport_reservation_documents (reservation_id, document_id)
SELECT tr.id, tr.document_id
FROM transport_reservations tr
JOIN documents d ON d.id = tr.document_id
WHERE tr.document_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill para hotel_reservation_documents
INSERT INTO hotel_reservation_documents (hotel_id, document_id)
SELECT hr.id, hr.document_id
FROM hotel_reservations hr
JOIN documents d ON d.id = hr.document_id
WHERE hr.document_id IS NOT NULL
ON CONFLICT DO NOTHING;
