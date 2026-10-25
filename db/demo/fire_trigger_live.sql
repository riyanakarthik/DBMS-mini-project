-- =====================================================================
-- LIVE DEMO: watch the AFTER INSERT ON prices trigger fire. Repeatable.
--   psql "$DATABASE_URL" -f db/demo/fire_trigger_live.sql
--   psql "$DATABASE_URL" -v ticker=NVDA -f db/demo/fire_trigger_live.sql
--
-- No prices are invented. The script takes the company's two most recent
-- REAL price rows, DELETEs them, and INSERTs the exact same values back.
-- The re-INSERT is a genuine insert into prices, so the trigger fires once
-- per row: 2 new activity_log rows and a new companies.last_updated.
-- Everything runs in one transaction: if any step fails, the original
-- rows are untouched.
-- =====================================================================
\set ON_ERROR_STOP on
\if :{?ticker}
\else
  \set ticker AAPL
\endif

BEGIN;

\echo '=== BEFORE ==='
SELECT ticker, last_updated FROM companies WHERE ticker = :'ticker';
SELECT count(*) AS activity_log_rows,
       count(*) FILTER (WHERE action = 'PRICE_INSERT') AS price_insert_rows
FROM activity_log;

-- 1. Keep a copy of the two latest real rows for this company.
CREATE TEMP TABLE demo_rows ON COMMIT DROP AS
SELECT p.*
FROM prices p
JOIN companies c ON c.cik = p.cik
WHERE c.ticker = :'ticker'
ORDER BY p.trade_date DESC
LIMIT 2;

-- 2. Remove them (DELETE does not fire the AFTER INSERT trigger).
DELETE FROM prices
WHERE (cik, trade_date) IN (SELECT cik, trade_date FROM demo_rows);

-- Pause one moment so the new last_updated is visibly different.
SELECT pg_sleep(1);

-- 3. Insert the same real rows back: the trigger fires for each row.
\echo '=== INSERT 2 price rows ==='
INSERT INTO prices (cik, trade_date, open, high, low, close, volume)
SELECT cik, trade_date, open, high, low, close, volume
FROM demo_rows;

\echo '=== AFTER ==='
SELECT ticker, last_updated FROM companies WHERE ticker = :'ticker';
SELECT count(*) AS activity_log_rows,
       count(*) FILTER (WHERE action = 'PRICE_INSERT') AS price_insert_rows
FROM activity_log;

\echo '=== The newest activity_log rows (written by the trigger) ==='
SELECT l.log_id, l.action, c.ticker, l.user_id, l.logged_at
FROM activity_log l
LEFT JOIN companies c ON c.cik = l.cik
ORDER BY l.log_id DESC
LIMIT 3;

COMMIT;
