-- Daily price history of one company for the dashboard chart
-- (GET /api/prices?ticker=).  $1 = ticker
SELECT p.trade_date, p.open, p.high, p.low, p.close, p.volume
FROM prices p
JOIN companies c ON c.cik = p.cik
WHERE c.ticker = $1
ORDER BY p.trade_date;      -- served by prices_pkey (cik, trade_date)
