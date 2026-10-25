-- =====================================================================
-- Indexes. Run after db/schema.sql:  psql "$DATABASE_URL" -f db/indexes.sql
--
-- Indexes that ALREADY exist automatically (not repeated here):
--   companies_pkey (cik), companies_ticker_key (ticker)
--   prices_pkey (cik, trade_date): also serves "all prices of one company"
--     because cik is its leading column; a separate index on prices(cik)
--     would be redundant (see db/migrations/002_drop_redundant_index.sql).
--   watchlists_pkey (user_id, cik), profiles_pkey, activity_log_pkey
-- =====================================================================

-- 1. B-tree on trade_date.
--    The composite PK starts with cik, so it cannot help queries that ask
--    "what are the latest trading dates across ALL companies?" (the first
--    step of the top_movers view) or "all prices on date X". This index lets
--    Postgres read dates newest-first straight from the index instead of
--    scanning and sorting the whole prices table.
CREATE INDEX IF NOT EXISTS idx_prices_trade_date
    ON prices (trade_date);

-- 2. HNSW index on the description embeddings (pgvector).
--    HNSW = Hierarchical Navigable Small World: a layered graph in which
--    each vector links to its near neighbours, so a nearest-neighbour search
--    hops through the graph instead of comparing against every row.
--    It is approximate (ANN): very fast, may very occasionally miss a true
--    neighbour.
--    The operator class MUST match the operator used in queries:
--      vector_cosine_ops  <->  ORDER BY description_embedding <=> $query
--    (a vector_l2_ops index would be ignored by a <=> query).
--    m / ef_construction are pgvector's defaults, written out for clarity:
--      m = 16               links per node per layer
--      ef_construction = 64 candidate list size while building
--    With 92 rows the planner may still choose a sequential scan (cheaper at
--    this size); the index is what keeps the search fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_companies_embedding
    ON companies USING hnsw (description_embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
