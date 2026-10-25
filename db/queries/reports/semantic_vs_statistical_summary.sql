-- =====================================================================
-- REPORT (companion): one-number answers to "does semantic similarity
-- predict return correlation?"
--   npx tsx scripts/run-sql.ts db/queries/reports/semantic_vs_statistical_summary.sql
--
--   corr_all_pairs     : Pearson corr between cosine_sim and return_corr
--                        across all 4186 pairs (does more similar text go
--                        with more similar price moves?)
--   corr_within_sector : the same, only for same-sector pairs; tests whether
--                        embeddings add information BEYOND the sector label
--   corr_cross_sector  : the same, only for different-sector pairs
--   avg_jaccard        : average over all companies of
--                        |semantic top-5 ∩ correlation top-5| / |union|
--   (0 = no overlap, 1 = identical lists; two random top-5 lists out of 91
--    companies would overlap by about 5*5/91 = 0.27 names, Jaccard ≈ 0.03)
-- =====================================================================
WITH last_year AS (
    SELECT cik, trade_date, close
    FROM prices
    WHERE trade_date > (SELECT max(trade_date) FROM prices) - INTERVAL '1 year'
),
daily_returns AS (
    SELECT cik, trade_date,
           (close / LAG(close) OVER (PARTITION BY cik ORDER BY trade_date) - 1)::float8 AS ret
    FROM last_year
),
directed_pairs AS (
    -- Both directions (A,B) and (B,A): needed to rank each company's
    -- neighbours from its own point of view.
    SELECT a.cik AS cik,
           b.cik AS other,
           corr(a.ret, b.ret) AS return_corr
    FROM daily_returns a
    JOIN daily_returns b
      ON b.trade_date = a.trade_date
     AND a.cik <> b.cik
    GROUP BY a.cik, b.cik
),
scored AS (
    SELECT d.cik,
           d.other,
           d.return_corr,
           1 - (ca.description_embedding <=> cb.description_embedding) AS cosine_sim,
           ca.sector = cb.sector AS same_sector,
           -- rank 1..91 of each company's neighbours, separately by each measure
           ROW_NUMBER() OVER (PARTITION BY d.cik ORDER BY d.return_corr DESC)
               AS corr_rank,
           ROW_NUMBER() OVER (PARTITION BY d.cik
                              ORDER BY ca.description_embedding <=> cb.description_embedding)
               AS semantic_rank
    FROM directed_pairs d
    JOIN companies ca ON ca.cik = d.cik
    JOIN companies cb ON cb.cik = d.other
),
jaccard_per_company AS (
    -- intersection = neighbours in BOTH top-5 lists; union = 5 + 5 - intersection
    SELECT cik,
           count(*) FILTER (WHERE corr_rank <= 5 AND semantic_rank <= 5) AS overlap
    FROM scored
    GROUP BY cik
)
SELECT
    -- each unordered pair appears twice in `scored`; that does not change a correlation
    round(corr(cosine_sim, return_correlation_all)::numeric, 3)                 AS corr_all_pairs,
    round(corr(cosine_sim, return_correlation_all)
          FILTER (WHERE same_sector)::numeric, 3)                               AS corr_within_sector,
    round(corr(cosine_sim, return_correlation_all)
          FILTER (WHERE NOT same_sector)::numeric, 3)                           AS corr_cross_sector,
    (SELECT round(avg(overlap / (10.0 - overlap)), 3) FROM jaccard_per_company) AS avg_jaccard,
    (SELECT round(avg(overlap), 2) FROM jaccard_per_company)                    AS avg_overlap_of_5
FROM (SELECT cosine_sim, return_corr AS return_correlation_all, same_sector FROM scored) s;
