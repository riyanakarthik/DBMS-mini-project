-- =====================================================================
-- Migration 002: DROP, removing a redundant index (and a throwaway view).
--   psql "$DATABASE_URL" -f db/migrations/002_drop_redundant_index.sql
--
-- Story: an early draft of the design indexed prices(cik) to speed up
-- "all prices of one company". That index is redundant: the primary key
-- index prices_pkey is on (cik, trade_date), and a B-tree on (a, b) can
-- serve lookups on its leading column `a` alone. A redundant index costs
-- disk space and slows every INSERT (both indexes must be updated, which
-- matters for the price batches) while giving no read benefit.
--
-- This script re-creates that draft index so the demo is self-contained,
-- shows its cost, then DROPs it and shows the query still uses an index.
-- =====================================================================

-- The draft index (as it would have existed before this migration).
CREATE INDEX IF NOT EXISTS idx_prices_cik ON prices (cik);

\echo '--- before DROP: index sizes on prices'
SELECT indexrelid::regclass AS index_name,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_index
WHERE indrelid = 'prices'::regclass
ORDER BY 1;

-- The actual migration.
DROP INDEX IF EXISTS idx_prices_cik;

\echo '--- after DROP: a per-company lookup still uses an index (prices_pkey)'
EXPLAIN (COSTS OFF)
SELECT trade_date, close FROM prices WHERE cik = '0000320193';

-- DROP VIEW: a scratch view created while prototyping top_movers, no
-- longer needed now that the real view exists in db/views.sql.
CREATE OR REPLACE VIEW scratch_latest_close AS
SELECT cik, max(trade_date) AS latest_date FROM prices GROUP BY cik;
DROP VIEW IF EXISTS scratch_latest_close;

\echo '--- after DROP VIEW: remaining views in public'
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public';
