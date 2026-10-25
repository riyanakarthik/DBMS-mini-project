-- =====================================================================
-- REPORT: Top 10 movers on the latest trading day.
-- Demonstrates: querying a VIEW (db/views.sql) like a table.
--   npx tsx scripts/run-sql.ts db/queries/reports/top_movers_top10.sql
-- The view is already ordered by pct_change DESC; LIMIT keeps the top 10.
-- =====================================================================
SELECT ticker,
       name,
       sector,
       prev_date,
       trade_date,
       prev_close,
       close,
       pct_change,
       volume
FROM top_movers
LIMIT 10;
