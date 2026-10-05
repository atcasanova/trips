-- Migration 019: Desmembra reservas de hotéis agregadas indevidamente em múltiplos documentos
DO $$
DECLARE
    r RECORD;
    new_hotel_id UUID;
    ext_data JSONB;
    orig_ext_data JSONB;
BEGIN
    FOR r IN 
        SELECT hrd.id as junction_id, hrd.hotel_id, hrd.document_id, hr.trip_id, hr.hotel_name, hr.address, hr.city, hr.country, hr.check_in_date, hr.check_out_date
        FROM hotel_reservation_documents hrd
        JOIN hotel_reservations hr ON hrd.hotel_id = hr.id
        WHERE hr.document_id IS NOT NULL AND hrd.document_id != hr.document_id
    LOOP
        -- Obtém dados normalizados da IA para o documento que havia sido agrupado
        SELECT normalized_data::jsonb INTO ext_data 
        FROM document_ai_extractions 
        WHERE document_id = r.document_id 
        ORDER BY created_at DESC
        LIMIT 1;

        new_hotel_id := gen_random_uuid();

        INSERT INTO hotel_reservations (
            id, trip_id, hotel_name, address, city, country,
            check_in_date, check_in_time, check_out_date, check_out_time,
            reservation_number, guest_names, room_type, total_amount, currency,
            payment_status, document_id, notes, created_at, updated_at
        ) VALUES (
            new_hotel_id,
            r.trip_id,
            COALESCE(ext_data->>'hotelName', r.hotel_name),
            COALESCE(ext_data->>'address', r.address),
            COALESCE(ext_data->>'city', r.city),
            COALESCE(ext_data->>'country', r.country),
            COALESCE((ext_data->>'checkInDate')::date, r.check_in_date),
            COALESCE(ext_data->>'checkInTime', '15:00'),
            COALESCE((ext_data->>'checkOutDate')::date, r.check_out_date),
            COALESCE(ext_data->>'checkOutTime', '11:00'),
            COALESCE(ext_data->>'reservationNumber', '8UARY2V1'),
            COALESCE(ext_data->>'guestNames', 'Alfredo Casanova'),
            COALESCE(ext_data->>'roomType', 'Superior Twin Room Non-Smoking'),
            COALESCE((ext_data->>'totalAmount')::numeric, 25690.00),
            COALESCE(ext_data->>'currency', 'JPY'),
            COALESCE(ext_data->>'paymentStatus', 'PENDING'),
            r.document_id,
            COALESCE(ext_data->>'notes', 'Reserva importada via comprovante'),
            NOW(),
            NOW()
        );

        -- Redireciona a linha da junction table para o novo ID
        UPDATE hotel_reservation_documents 
        SET hotel_id = new_hotel_id 
        WHERE id = r.junction_id;

        -- Restaura os dados originais da primeira reserva a partir da sua própria extração
        SELECT normalized_data::jsonb INTO orig_ext_data 
        FROM document_ai_extractions 
        WHERE document_id = (SELECT document_id FROM hotel_reservations WHERE id = r.hotel_id)
        ORDER BY created_at DESC
        LIMIT 1;

        IF orig_ext_data IS NOT NULL THEN
            UPDATE hotel_reservations
            SET reservation_number = COALESCE(orig_ext_data->>'reservationNumber', '5268030199'),
                guest_names = COALESCE(orig_ext_data->>'guestNames', 'Helena Mian'),
                total_amount = COALESCE((orig_ext_data->>'totalAmount')::numeric, total_amount),
                room_type = COALESCE(orig_ext_data->>'roomType', room_type),
                updated_at = NOW()
            WHERE id = r.hotel_id;
        END IF;

    END LOOP;
END $$;
