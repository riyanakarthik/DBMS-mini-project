-- =====================================================================
-- REPORT: Sectors with more than N companies whose average 1-year
-- % change is above X.
-- Demonstrates: GROUP BY + HAVING (a filter on GROUPS, applied after
-- aggregation; WHERE filters rows before aggregation).
--   $1 = N (min companies, exclusive), $2 = X (min avg % change, exclusive)
--   npx tsx scripts/run-sql.ts db/queries/reports/sector_having.sql 6 0
-- =====================================================================
WITH window_bounds AS (
    -- each company's first and last trading day within the last year
    SELECT cik,
           min(trade_date) AS first_day,
           max(trade_date) AS last_day
    FROM prices
    WHERE trade_date > (SELECT max(trade_date) FROM prices) - INTERVAL '1 year'
    GROUP BY cik
),
company_change AS (
    -- % change from the first to the last close in that window
    SELECT b.cik,
           (p_last.close / p_first.close - 1) * 100 AS pct_change
    FROM window_bounds b
    JOIN prices p_first ON p_first.cik = b.cik AND p_first.trade_date = b.first_day
    JOIN prices p_last  ON p_last.cik  = b.cik AND p_last.trade_date  = b.last_day
)
SELECT c.sector,
       count(*)                       AS companies,
       round(avg(cc.pct_change), 2)   AS avg_pct_change_1y,
       round(min(cc.pct_change), 2)   AS worst_company_pct,
       round(max(cc.pct_change), 2)   AS best_company_pct
FROM company_change cc
JOIN companies c ON c.cik = cc.cik
GROUP BY c.sector
HAVING count(*) > $1                  -- keep only sectors with more than N companies
   AND avg(cc.pct_change) > $2        -- ...and an average % change above X
ORDER BY avg_pct_change_1y DESC;
