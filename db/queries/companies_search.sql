-- Company search + filter for the UI (GET /api/companies?q=&sector=).
--   $1 = search text or NULL (matches ticker prefix or any part of the name)
--   $2 = sector or NULL
-- ILIKE = case-insensitive LIKE. "$1::text IS NULL OR ..." makes each filter
-- optional with one fixed, parameterised statement (no SQL string building).
SELECT cik, ticker, name, sector, industry
FROM companies
WHERE ($1::text IS NULL OR ticker ILIKE $1 || '%' OR name ILIKE '%' || $1 || '%')
  AND ($2::text IS NULL OR sector = $2)
ORDER BY ticker;
