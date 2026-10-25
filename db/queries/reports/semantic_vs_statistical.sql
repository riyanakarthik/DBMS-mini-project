-- =====================================================================
-- REPORT: Does semantic similarity predict return correlation?
--   npx tsx scripts/run-sql.ts db/queries/reports/semantic_vs_statistical.sql
--
-- For every unordered pair of companies (A, B) we compute
--   return_corr = Pearson correlation of their daily returns (last year)
--   cosine_sim  = 1 - cosine distance of their description embeddings
-- and compare the AVERAGE return correlation of different groups of pairs:
--   semantic top-5 : B is one of A's 5 nearest description neighbours
--   (split into those in the same sector / a different sector, to see
--    whether embeddings add anything beyond the sector label)
--   same sector    : A and B share a yfinance sector
--   random sample  : pseudo-random pairs, same count as the semantic group
--   all pairs      : every pair, the baseline
-- Caveat: pairs share companies, so they are not independent samples;
-- treat differences as descriptive, not as a significance test.
-- =====================================================================
WITH last_year AS (
    SELECT cik, trade_date, close
    FROM prices
    WHERE trade_date > (SELECT max(trade_date) FROM prices) - INTERVAL '1 year'
),
daily_returns AS (
    -- daily return = close / previous close - 1, per company (see correlated_companies.sql)
    SELECT cik, trade_date,
           (close / LAG(close) OVER (PARTITION BY cik ORDER BY trade_date) - 1)::float8 AS ret
    FROM last_year
),
pair_corr AS (
    -- Return correlation for EVERY pair. a.cik < b.cik keeps each unordered
    -- pair once (A,B) and skips (B,A) and (A,A): 92*91/2 = 4186 pairs.
    SELECT a.cik AS cik_a,
           b.cik AS cik_b,
           corr(a.ret, b.ret) AS return_corr
    FROM daily_returns a
    JOIN daily_returns b
      ON b.trade_date = a.trade_date        -- align returns on the same day
     AND a.cik < b.cik
    GROUP BY a.cik, b.cik
),
pairs AS (
    -- Attach the semantic side (cosine similarity) and the sector flag.
    SELECT pc.cik_a,
           pc.cik_b,
           pc.return_corr,
           1 - (ca.description_embedding <=> cb.description_embedding) AS cosine_sim,
           ca.sector = cb.sector AS same_sector
    FROM pair_corr pc
    JOIN companies ca ON ca.cik = pc.cik_a
    JOIN companies cb ON cb.cik = pc.cik_b
),
semantic_pairs AS (
    -- Each company's 5 nearest description neighbours. LATERAL lets the
    -- subquery refer to the outer row c (a "for each company" loop in SQL).
    -- LEAST/GREATEST turn (A,B) and (B,A) into the same unordered pair, and
    -- DISTINCT removes pairs that are in each other's top-5 twice.
    SELECT DISTINCT LEAST(c.cik, n.cik)    AS cik_a,
                    GREATEST(c.cik, n.cik) AS cik_b
    FROM companies c
    CROSS JOIN LATERAL (
        SELECT o.cik
        FROM companies o
        WHERE o.cik <> c.cik
        ORDER BY o.description_embedding <=> c.description_embedding
        LIMIT 5
    ) AS n
),
random_pairs AS (
    -- Deterministic "random" sample: order pairs by a hash of their keys, so
    -- the report gives the same numbers on every run. Same size as the
    -- semantic group so the comparison is like-for-like.
    SELECT cik_a, cik_b
    FROM pairs
    ORDER BY md5(cik_a || cik_b)
    LIMIT (SELECT count(*) FROM semantic_pairs)
),
grouped AS (
    SELECT 1 AS sort_key, 'Semantic top-5 neighbours' AS pair_group, p.*
    FROM pairs p JOIN semantic_pairs USING (cik_a, cik_b)
    UNION ALL
    SELECT 2, '  ...of which same sector', p.*
    FROM pairs p JOIN semantic_pairs USING (cik_a, cik_b) WHERE p.same_sector
    UNION ALL
    SELECT 3, '  ...of which different sector', p.*
    FROM pairs p JOIN semantic_pairs USING (cik_a, cik_b) WHERE NOT p.same_sector
    UNION ALL
    SELECT 4, 'Same-sector pairs', p.* FROM pairs p WHERE p.same_sector
    UNION ALL
    SELECT 5, 'Random pairs (sample)', p.* FROM pairs p JOIN random_pairs USING (cik_a, cik_b)
    UNION ALL
    SELECT 6, 'All pairs (baseline)', p.* FROM pairs p
)
SELECT pair_group,
       count(*)                                 AS pairs,
       round(avg(return_corr)::numeric, 3)      AS avg_return_corr,
       round(stddev(return_corr)::numeric, 3)   AS sd_return_corr,
       round(avg(cosine_sim)::numeric, 3)       AS avg_cosine_sim
FROM grouped
GROUP BY sort_key, pair_group
ORDER BY sort_key;
