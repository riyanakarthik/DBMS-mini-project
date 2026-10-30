# Vector Database Implementation (pgvector)

This answers the five questions in requirements §8: what is embedded, which model, how vectors are stored, the similarity metric, and how results are retrieved. It also covers indexes, metadata and limitations (§4).

## 1. What is converted into embeddings
**Only `companies.description`**: each company's business summary from yfinance (`longBusinessSummary`), one vector per company, 92 in total. Whitespace is collapsed in `seed/clean_data.py`, and descriptions shorter than 100 characters would be dropped (none were). Measured lengths: 362–2,765 characters (median 1,484).

The **sector and industry labels are deliberately NOT embedded**. If they were, the report "do embeddings capture sector structure?" would be circular.

## 2. Embedding model
| Property | Value |
|---|---|
| Model | `sentence-transformers/all-MiniLM-L6-v2` (sentence-transformers 6.2.0, torch 2.14.1) |
| Dimensions | **384** |
| Normalisation | `normalize_embeddings=True`: every vector has length 1. Verified in the database: `vector_norm` min = max = 1.0000 for all 92 rows. |
| Max input | 256 word-piece tokens; longer text is truncated (see limitations) |
| Where it runs | Locally, once, in `seed/embed_descriptions.py` (CPU; no API key, no cost) |
| Incremental | By default only rows whose embedding is NULL are embedded; `--all` re-embeds everything |

## 3. How vectors are stored (data model and metadata)
```sql
companies.description_embedding  VECTOR(384)   -- pgvector type; dimension enforced
```
- The vector is a **column on the company's row**, keyed by the same `cik`. There is no separate collection and no ID mapping to keep in sync.
- **Metadata** = the rest of the row: `ticker`, `name`, `sector`, `industry`, and joinable `prices`. Filters and joins happen in the same SQL statement.
- Writes: `UPDATE companies SET description_embedding = $1::vector WHERE cik = $2`, all in one transaction. A vector of the wrong size is rejected by the type (`expected 384 dimensions, not 3`, tested in Phase 1).
- **Consistency rule:** when the seed loader sees a changed description, it sets the embedding to NULL in the same upsert, so a stale vector can never sit next to new text.

## 4. Similarity metric: cosine distance
pgvector operator **`<=>`** = cosine distance = 1 − cos θ (0 = same direction, 2 = opposite). We report **similarity = 1 − distance**.
- Cosine compares *direction* (meaning) and ignores vector length, which loosely tracks text length.
- With normalised vectors, cosine, L2 and inner-product orderings are identical. `<=>` is used because it states the intent directly, and the index opclass matches it.

## 5. Index: HNSW
```sql
CREATE INDEX idx_companies_embedding ON companies
USING hnsw (description_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```
- **HNSW** (Hierarchical Navigable Small World) is a layered proximity graph. A search hops through it towards the query instead of comparing against every row. It is *approximate*: very fast, but may occasionally miss a true neighbour.
- The **opclass must match the operator**: `vector_cosine_ops` ↔ `<=>`. An L2 index would be ignored by a cosine query.
- At 92 rows the planner normally prefers a sequential scan, which is cheaper at this size. With `enable_seqscan = off`, EXPLAIN shows `Index Scan using idx_companies_embedding … Order By: (description_embedding <=> (InitPlan 1).col1)`, and the results were **identical** to the exact scan for JPM (`docs/evidence/phase2_query_plans.txt`).

## 6. Retrieval strategy: top-k nearest neighbours
[`db/queries/similar_companies.sql`](../db/queries/similar_companies.sql) (used by `/api/similar`):
```sql
SELECT ticker, name, sector, industry,
       round((1 - (description_embedding <=> q.emb))::numeric, 3) AS cosine_similarity
FROM companies,
     (SELECT description_embedding AS emb FROM companies WHERE ticker = $1) AS q
WHERE ticker <> $1
ORDER BY description_embedding <=> (SELECT description_embedding FROM companies WHERE ticker = $1)
LIMIT 5;
```
- **k = 5**; the query company itself is excluded.
- The query vector is passed as an **uncorrelated scalar subquery**, which Postgres evaluates once as an "InitPlan". This is required for the HNSW index to be usable. Our first version joined to the target row instead, and EXPLAIN showed it could *never* use the index (it sorts all rows). That was found and fixed in Phase 2.
- For whole-table analysis (each company's top-5 for all 92 companies), `semantic_vs_statistical.sql` uses `CROSS JOIN LATERAL (… ORDER BY <=> … LIMIT 5)`, a "for each company" loop in SQL.

## 7. Does it work? (real results)
| Company | Top-5 semantic neighbours (cosine similarity) |
|---|---|
| JPM | MS 0.635, GS 0.615, BAC 0.589, WFC 0.526, MA 0.460 |
| NVDA | AMD 0.586, INTC 0.549, TXN 0.469, CRM 0.461, AVGO 0.451 |
| XOM | CVX 0.662, PSX 0.623, OXY 0.520, **GE 0.489**, EOG 0.473 |
| KO | PEP 0.691, KHC 0.472, MDLZ 0.412, WMT 0.399, PG 0.391 |

Sector structure: in **11 of 11 sectors**, the average distance to same-sector companies is lower than to other sectors. The ratio of cross-sector to within-sector distance ranges from 1.08 (Basic Materials) to 1.51 (Utilities).

## 8. Limitations
- **Truncation:** 55 of 92 descriptions (**60%**) are longer than the model's 256-token limit (median 277.5, max 579 tokens), so their tail is ignored. The opening sentences, which say what the company does, are kept.
- **Small general-purpose model:** MiniLM is not finance-specific. Some neighbours are weak, e.g. GE Aerospace as XOM's 4th neighbour, probably because both mention engines, turbines and fuel.
- **Description quality:** yfinance summaries vary in style and length, and the embedding reflects that.
- **Semantic ≠ statistical:** across sectors, description similarity barely predicts return correlation (see [important-queries.md](important-queries.md)). Embeddings describe *what a company does*, not *how its stock behaves*.
- **Search starts from a company:** free-text queries ("cloud security companies") would need the same model at request time; not implemented.
