-- =====================================================================
-- REPORT: Companies whose latest close is above their OWN average close.
-- Demonstrates: correlated SUBQUERIES. The inner SELECTs refer to the
-- outer row (c.cik), so they are re-evaluated for each company.
--   npx tsx scripts/run-sql.ts db/queries/reports/above_own_average.sql
-- =====================================================================
SELECT c.ticker,
       c.name,
       c.sector,
       p.close                                                 AS latest_close,
       round((SELECT avg(p2.close)
              FROM prices p2
              WHERE p2.cik = c.cik), 2)                        AS avg_close,
       round((p.close / (SELECT avg(p2.close)
                         FROM prices p2
                         WHERE p2.cik = c.cik) - 1) * 100, 2) AS pct_above_avg
FROM companies c
JOIN prices p
  ON p.cik = c.cik
 -- subquery 1: pick only this company's most recent price row
 AND p.trade_date = (SELECT max(p3.trade_date)
                     FROM prices p3
                     WHERE p3.cik = c.cik)
-- subquery 2: keep the company only if that close beats its own average
WHERE p.close > (SELECT avg(p2.close)
                 FROM prices p2
                 WHERE p2.cik = c.cik)
ORDER BY pct_above_avg DESC;
