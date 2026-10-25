-- The user's watchlist with each company's latest close (GET /api/watchlist).
--   $1 = user_id
SELECT c.ticker, c.name, c.sector, w.cik, w.note, w.created_at, w.updated_at,
       latest.close AS latest_close, latest.trade_date AS latest_date
FROM watchlists w
JOIN companies c ON c.cik = w.cik
-- LATERAL: for each watchlist row, fetch that company's most recent price
CROSS JOIN LATERAL (
    SELECT p.close, p.trade_date
    FROM prices p
    WHERE p.cik = w.cik
    ORDER BY p.trade_date DESC
    LIMIT 1
) AS latest
WHERE w.user_id = $1
ORDER BY w.created_at DESC;
