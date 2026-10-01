-- Migration 014: Backfill trip primary_country based on existing title, destination_summary, and cities

-- 1. Japão
UPDATE trips
SET primary_country = 'Japão'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Japão%' OR title ILIKE '%Japan%' OR title ILIKE '%Toquio%' OR title ILIKE '%Tóquio%'
    OR destination_summary ILIKE '%Tokyo%' OR destination_summary ILIKE '%Toquio%' OR destination_summary ILIKE '%Tóquio%' OR destination_summary ILIKE '%Kyoto%' OR destination_summary ILIKE '%Osaka%'
    OR cities::text ILIKE '%"Tokyo"%' OR cities::text ILIKE '%"Toquio"%' OR cities::text ILIKE '%"Tóquio"%' OR cities::text ILIKE '%"Kyoto"%' OR cities::text ILIKE '%"Osaka"%'
  );

-- 2. Brasil
UPDATE trips
SET primary_country = 'Brasil'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Brasil%' OR title ILIKE '%Brazil%' OR title ILIKE '% em BH%' OR title ILIKE '% BH%' OR title ILIKE '%São Paulo%' OR title ILIKE '%Rio de Janeiro%'
    OR destination_summary ILIKE '%Belo Horizonte%' OR destination_summary ILIKE '%São Paulo%' OR destination_summary ILIKE '%Rio de Janeiro%' OR destination_summary ILIKE '%Brasília%' OR destination_summary ILIKE '%Salvador%'
    OR cities::text ILIKE '%"Belo Horizonte"%' OR cities::text ILIKE '%"São Paulo"%' OR cities::text ILIKE '%"Rio de Janeiro"%' OR cities::text ILIKE '%"Brasília"%' OR cities::text ILIKE '%"Curitiba"%'
  );

-- 3. França
UPDATE trips
SET primary_country = 'França'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%França%' OR title ILIKE '%France%' OR title ILIKE '%Paris%'
    OR destination_summary ILIKE '%Paris%' OR destination_summary ILIKE '%Nice%'
    OR cities::text ILIKE '%"Paris"%' OR cities::text ILIKE '%"Nice"%'
  );

-- 4. Estados Unidos
UPDATE trips
SET primary_country = 'Estados Unidos'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%USA%' OR title ILIKE '%Estados Unidos%' OR title ILIKE '%United States%' OR title ILIKE '%EUA%' OR title ILIKE '%Nova York%' OR title ILIKE '%New York%' OR title ILIKE '%Orlando%' OR title ILIKE '%Miami%'
    OR destination_summary ILIKE '%Las Vegas%' OR destination_summary ILIKE '%Houston%' OR destination_summary ILIKE '%New York%' OR destination_summary ILIKE '%Miami%' OR destination_summary ILIKE '%Orlando%'
    OR cities::text ILIKE '%"Las Vegas"%' OR cities::text ILIKE '%"Houston"%' OR cities::text ILIKE '%"New York"%' OR cities::text ILIKE '%"Miami"%' OR cities::text ILIKE '%"Orlando"%'
  );

-- 5. Itália
UPDATE trips
SET primary_country = 'Itália'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Itália%' OR title ILIKE '%Italy%' OR title ILIKE '%Roma%' OR title ILIKE '%Rome%'
    OR destination_summary ILIKE '%Roma%' OR destination_summary ILIKE '%Milão%' OR destination_summary ILIKE '%Florença%'
    OR cities::text ILIKE '%"Roma"%' OR cities::text ILIKE '%"Rome"%' OR cities::text ILIKE '%"Milao"%' OR cities::text ILIKE '%"Milão"%'
  );

-- 6. Reino Unido
UPDATE trips
SET primary_country = 'Reino Unido'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Reino Unido%' OR title ILIKE '%London%' OR title ILIKE '%Londres%' OR title ILIKE '%Inglaterra%'
    OR destination_summary ILIKE '%London%' OR destination_summary ILIKE '%Londres%'
    OR cities::text ILIKE '%"London"%' OR cities::text ILIKE '%"Londres"%'
  );

-- 7. Portugal
UPDATE trips
SET primary_country = 'Portugal'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Portugal%' OR title ILIKE '%Lisboa%' OR title ILIKE '%Porto%'
    OR destination_summary ILIKE '%Lisboa%' OR destination_summary ILIKE '%Porto%'
    OR cities::text ILIKE '%"Lisboa"%' OR cities::text ILIKE '%"Porto"%'
  );

-- 8. Espanha
UPDATE trips
SET primary_country = 'Espanha'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Espanha%' OR title ILIKE '%Spain%' OR title ILIKE '%Madrid%' OR title ILIKE '%Madri%' OR title ILIKE '%Barcelona%'
    OR destination_summary ILIKE '%Madrid%' OR destination_summary ILIKE '%Barcelona%'
    OR cities::text ILIKE '%"Madrid"%' OR cities::text ILIKE '%"Barcelona"%'
  );

-- 9. Alemanha
UPDATE trips
SET primary_country = 'Alemanha'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Alemanha%' OR title ILIKE '%Germany%' OR title ILIKE '%Berlim%' OR title ILIKE '%Berlin%' OR title ILIKE '%Munique%'
    OR destination_summary ILIKE '%Berlim%' OR destination_summary ILIKE '%Munique%'
    OR cities::text ILIKE '%"Berlin"%' OR cities::text ILIKE '%"Berlim"%' OR cities::text ILIKE '%"Munich"%'
  );

-- 10. Argentina
UPDATE trips
SET primary_country = 'Argentina'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Argentina%' OR title ILIKE '%Buenos Aires%' OR title ILIKE '%Bariloche%'
    OR destination_summary ILIKE '%Buenos Aires%' OR destination_summary ILIKE '%Bariloche%'
    OR cities::text ILIKE '%"Buenos Aires"%' OR cities::text ILIKE '%"Bariloche"%'
  );

-- 11. Chile
UPDATE trips
SET primary_country = 'Chile'
WHERE (primary_country IS NULL OR trim(primary_country) = '')
  AND (
    title ILIKE '%Chile%' OR title ILIKE '%Santiago%'
    OR destination_summary ILIKE '%Santiago%' OR destination_summary ILIKE '%Atacama%'
    OR cities::text ILIKE '%"Santiago"%' OR cities::text ILIKE '%"Atacama"%'
  );
