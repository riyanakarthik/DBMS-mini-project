-- =====================================================================
-- STATISTICAL similarity: top-5 companies whose daily returns are most
-- correlated with one company's, over the last year.
--   $1 = ticker, e.g. 'JPM'
--   npx tsx scripts/run-sql.ts db/queries/correlated_companies.sql JPM
--
-- Daily return on day t = close(t) / close(t-1) - 1.
-- Pearson correlation = corr(x, y), +1 = always move together,
-- 0 = unrelated, -1 = always move in opposite directions.
-- =====================================================================
WITH last_year AS (
    -- Step 1: only the most recent year of prices.
    SELECT cik, trade_date, close
    FROM prices
    WHERE trade_date > (SELECT max(trade_date) FROM prices) - INTERVAL '1 year'
),
daily_returns AS (
    -- Step 2: LAG(close) = the previous row's close for the SAME company
    -- (PARTITION BY cik) in date order (ORDER BY trade_date).
    -- Each company's first day has no previous close, so ret is NULL there;
    -- corr() and regr_count() skip NULL pairs automatically.
    SELECT cik,
           trade_date,
           (close / LAG(close) OVER (PARTITION BY cik ORDER BY trade_date) - 1)::float8 AS ret
    FROM last_year
)
-- Step 3: pair the target's return with every other company's return ON THE
-- SAME DAY (join on trade_date = "aligned" returns), then correlate per company.
SELECT c.ticker,
       c.name,
       c.sector,
       c.industry,
       round(corr(t.ret, o.ret)::numeric, 3) AS return_correlation,
       regr_count(t.ret, o.ret)             AS days_used   -- non-NULL pairs
FROM daily_returns t                       -- t = target company
JOIN daily_returns o                       -- o = every other company
  ON o.trade_date = t.trade_date
 AND o.cik <> t.cik
JOIN companies c
  ON c.cik = o.cik
WHERE t.cik = (SELECT cik FROM companies WHERE ticker = $1)
GROUP BY c.ticker, c.name, c.sector, c.industry
ORDER BY return_correlation DESC NULLS LAST
LIMIT 5;
