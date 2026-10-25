-- Snapshot used to demonstrate the prices trigger + top_movers view.
-- Run before AND after `seed/load_data.py --batch 2` and compare:
--   psql "$DATABASE_URL" -X -f db/tests/trigger_snapshot.sql

\echo '--- activity_log rows per action'
SELECT action, count(*) AS rows
FROM activity_log
GROUP BY action
ORDER BY action;

\echo '--- activity_log total, prices total, latest trade_date'
SELECT (SELECT count(*) FROM activity_log) AS activity_log_rows,
       (SELECT count(*) FROM prices)       AS price_rows,
       (SELECT max(trade_date) FROM prices) AS latest_trade_date;

\echo '--- companies.last_updated (set by the trigger), 3 examples'
SELECT ticker, last_updated
FROM companies
WHERE ticker IN ('AAPL', 'JPM', 'XOM')
ORDER BY ticker;

\echo '--- top_movers: top 5 gainers'
SELECT ticker, sector, prev_date, trade_date, prev_close, close, pct_change
FROM top_movers
LIMIT 5;

\echo '--- top_movers: bottom 5 (biggest losers)'
SELECT ticker, sector, prev_date, trade_date, prev_close, close, pct_change
FROM (SELECT * FROM top_movers ORDER BY pct_change ASC LIMIT 5) AS losers
ORDER BY pct_change ASC;
