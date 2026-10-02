-- Migration 015: Clean duplicate trip_travelers and add unique constraint on trip_id + email

-- 1. Merge provisional travelers (user_id IS NULL) into registered travelers (user_id IS NOT NULL) with same email
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT 
            reg.id AS registered_id,
            prov.id AS provisional_id,
            prov.ticket_name AS prov_ticket_name
        FROM trip_travelers prov
        JOIN trip_travelers reg 
          ON reg.trip_id = prov.trip_id 
         AND LOWER(TRIM(reg.email)) = LOWER(TRIM(prov.email))
        WHERE prov.user_id IS NULL 
          AND reg.user_id IS NOT NULL
          AND prov.id != reg.id
    LOOP
        -- If registered traveler has no ticket_name, copy from provisional
        IF rec.prov_ticket_name IS NOT NULL THEN
            UPDATE trip_travelers 
            SET ticket_name = rec.prov_ticket_name, updated_at = NOW()
            WHERE id = rec.registered_id AND ticket_name IS NULL;
        END IF;

        -- Reassign expenses
        UPDATE expenses 
        SET paid_by_traveler_id = rec.registered_id 
        WHERE paid_by_traveler_id = rec.provisional_id;

        -- Reassign expense splits (delete duplicate split if already exists for registered traveler)
        DELETE FROM expense_splits 
        WHERE traveler_id = rec.provisional_id 
          AND expense_id IN (SELECT expense_id FROM expense_splits WHERE traveler_id = rec.registered_id);

        UPDATE expense_splits 
        SET traveler_id = rec.registered_id 
        WHERE traveler_id = rec.provisional_id;

        -- Delete the provisional duplicate
        DELETE FROM trip_travelers WHERE id = rec.provisional_id;
    END LOOP;
END $$;

-- 2. Specifically clean up the Jaque provisional traveler if it still exists
DELETE FROM trip_travelers 
WHERE id = '28b617a5-af10-4eb2-beba-de5e2d61eea8'
  AND user_id IS NULL;

-- 3. Create unique index to guarantee no duplicate traveler with same email per trip
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_travelers_trip_email_uniq 
ON trip_travelers (trip_id, LOWER(TRIM(email))) 
WHERE email IS NOT NULL AND TRIM(email) != '';
