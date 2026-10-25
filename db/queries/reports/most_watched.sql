-- =====================================================================
-- REPORT: Most-watched companies across all users.
-- Demonstrates: JOIN across the M:N relationship table + GROUP BY + COUNT.
--   npx tsx scripts/run-sql.ts db/queries/reports/most_watched.sql
-- =====================================================================
SELECT c.ticker,
       c.name,
       c.sector,
       count(w.user_id)   AS watchers,        -- how many users watch it
       max(w.created_at)  AS last_added
FROM watchlists w
JOIN companies c
  ON c.cik = w.cik
GROUP BY c.ticker, c.name, c.sector
ORDER BY watchers DESC, c.ticker
LIMIT 10;
