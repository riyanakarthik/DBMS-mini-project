-- =====================================================================
-- REPORT (vector): Do the description embeddings capture sector structure?
-- For each sector: the average cosine DISTANCE (pgvector <=>) from its
-- companies to (a) other companies in the SAME sector and (b) companies in
-- OTHER sectors. If embeddings "know" sectors, within < across, and the
-- ratio across/within is well above 1.
-- Remember: the embeddings were built from description text ONLY; the
-- sector label was never shown to the model.
--   npx tsx scripts/run-sql.ts db/queries/reports/sector_embedding_distance.sql
-- =====================================================================
SELECT a.sector,
       count(DISTINCT a.cik) AS companies,
       round(avg(a.description_embedding <=> b.description_embedding)
             FILTER (WHERE b.sector = a.sector)::numeric, 3)   AS within_sector_distance,
       round(avg(a.description_embedding <=> b.description_embedding)
             FILTER (WHERE b.sector <> a.sector)::numeric, 3)  AS cross_sector_distance,
       round((avg(a.description_embedding <=> b.description_embedding)
                  FILTER (WHERE b.sector <> a.sector)
            / avg(a.description_embedding <=> b.description_embedding)
                  FILTER (WHERE b.sector = a.sector))::numeric, 2) AS ratio_cross_to_within
FROM companies a
JOIN companies b              -- every ordered pair of DIFFERENT companies
  ON b.cik <> a.cik
GROUP BY a.sector
ORDER BY ratio_cross_to_within DESC;
