-- =====================================================================
-- Views. Run after db/indexes.sql:  psql "$DATABASE_URL" -f db/views.sql
-- =====================================================================

-- top_movers: % change of every company between the two most recent
-- trading days in the database, biggest gainers first.
--
-- A view stores the QUERY, not the result, so it is always current:
-- after load_data.py --batch 2 inserts a new week, the same
-- SELECT * FROM top_movers automatically compares the new latest days.
CREATE OR REPLACE VIEW top_movers AS
WITH latest_two_days AS (
    -- The two most recent trading dates across all companies.
    -- Served by idx_prices_trade_date (read newest-first, stop after 2).
    SELECT DISTINCT trade_date
    FROM prices
    ORDER BY trade_date DESC
    LIMIT 2
),
day_pair AS (
    -- Turn the two dates into one row: (latest day, the day before it).
    SELECT max(trade_date) AS cur_date,
           min(trade_date) AS prev_date
    FROM latest_two_days
)
SELECT
    c.cik,
    c.ticker,
    c.name,
    c.sector,
    d.prev_date,
    prev.close                                   AS prev_close,
    d.cur_date                                   AS trade_date,
    cur.close                                    AS close,
    -- percentage change = (today - yesterday) / yesterday * 100
    round((cur.close - prev.close) / prev.close * 100, 2) AS pct_change,
    cur.volume
FROM day_pair d
JOIN prices cur                     -- each company's bar on the latest day
  ON cur.trade_date = d.cur_date
JOIN prices prev                    -- the same company's bar on the previous day
  ON prev.cik = cur.cik
 AND prev.trade_date = d.prev_date
JOIN companies c                    -- add ticker/name/sector for display
  ON c.cik = cur.cik
ORDER BY pct_change DESC;
