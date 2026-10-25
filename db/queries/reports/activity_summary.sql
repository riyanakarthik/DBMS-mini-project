-- =====================================================================
-- REPORT: Activity log summary per action type.
-- Demonstrates: GROUP BY + several aggregates, COUNT(DISTINCT ...).
-- PRICE_INSERT rows come from the prices trigger (no user);
-- WATCHLIST_* rows come from the app's transactions (with user_id).
--   npx tsx scripts/run-sql.ts db/queries/reports/activity_summary.sql
-- =====================================================================
SELECT action,
       count(*)                  AS events,
       count(DISTINCT cik)       AS companies,
       count(DISTINCT user_id)   AS users,     -- COUNT(DISTINCT) ignores NULLs
       min(logged_at)            AS first_at,
       max(logged_at)            AS last_at
FROM activity_log
GROUP BY action
ORDER BY events DESC;
