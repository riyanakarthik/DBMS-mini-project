-- =====================================================================
-- REPORT: Average closing price and average daily volume per sector.
-- Demonstrates: JOIN + GROUP BY + aggregate functions + ORDER BY.
--   npx tsx scripts/run-sql.ts db/queries/reports/sector_summary.sql
-- Covers every price row loaded (2025-09-22 .. latest).
-- =====================================================================
SELECT c.sector,
       count(DISTINCT c.cik)           AS companies,     -- distinct: each company has ~275 rows
       round(avg(p.close), 2)          AS avg_close,
       round(avg(p.volume))            AS avg_daily_volume,
       min(p.trade_date)               AS from_date,
       max(p.trade_date)               AS to_date
FROM companies c
JOIN prices p                         -- one output row per (company, day) before grouping
  ON p.cik = c.cik
GROUP BY c.sector                     -- collapse to one row per sector
ORDER BY avg_daily_volume DESC;       -- most heavily traded sectors first
