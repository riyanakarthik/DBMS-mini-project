-- Full top_movers view for the dashboard (GET /api/top-movers).
-- The view (db/views.sql) compares the two latest trading days.
SELECT ticker, name, sector, prev_date, trade_date, prev_close, close, pct_change, volume
FROM top_movers;
