-- =====================================================================
-- Vector similarity search: top-5 semantic neighbours of one company.
--   psql "$DATABASE_URL" -v ticker=JPM -f db/queries/similar_companies.sql
-- (The API route uses the same SQL with $1 in place of :'ticker'.)
--
-- <=> is pgvector's COSINE DISTANCE operator:
--   0 = same direction (same meaning) ... 2 = opposite.
--   similarity = 1 - distance.
--
-- Why a scalar subquery and not a JOIN to the target row:
-- the HNSW index (vector_cosine_ops) can only be used when the ORDER BY is
--   <indexed column> <=> <one fixed query vector>.
-- The uncorrelated subquery below is evaluated ONCE (an "InitPlan") and acts
-- as that fixed vector, so EXPLAIN shows "Index Scan using
-- idx_companies_embedding". Written as a join (FROM companies c, target t),
-- the planner must compute the distance for every row and sort, and the
-- index is never used (verified with EXPLAIN, see docs/evidence/).
-- =====================================================================
SELECT ticker,
       name,
       sector,
       industry,
       round((1 - (description_embedding <=> q.emb))::numeric, 3) AS cosine_similarity
FROM companies,
     -- the query vector, fetched once; reused in SELECT for the similarity
     (SELECT description_embedding AS emb FROM companies WHERE ticker = :'ticker') AS q
WHERE ticker <> :'ticker'                         -- exclude the company itself
ORDER BY description_embedding <=> (SELECT description_embedding
                                    FROM companies
                                    WHERE ticker = :'ticker')  -- nearest first
LIMIT 5;
