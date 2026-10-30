# Important Queries

Every SQL statement the application runs is a commented file in [`db/queries/`](../db/queries/), loaded by `lib/sql.ts` and executed with bound parameters (`$1, $2`). Any file can be run exactly as the API runs it:
```bash
npx tsx scripts/run-sql.ts db/queries/<file>.sql [param1 param2 ...]
```
Results quoted below are real outputs against the Supabase database (data: 92 companies, 25,300 prices, 2025-09-22 → 2026-10-23). Timings include the network round trip to Supabase.

## Concept coverage at a glance
| Concept (requirements §6–7) | Where |
|---|---|
| JOIN | Q2, Q5, R1, R2, R4, R5, R7, R9, W1 |
| GROUP BY + aggregates (AVG, COUNT, MIN/MAX, COUNT DISTINCT, STDDEV, corr) | Q5, R1, R2, R5, R6, R7, R8, R9 |
| HAVING | R2 |
| ORDER BY / LIMIT | almost all |
| Subqueries (scalar, correlated) | Q4, Q5, R4 |
| CTE (`WITH`) | Q5, R2, R7, R8 |
| Window functions (`LAG`, `ROW_NUMBER`) | Q5, R7, R8 |
| LATERAL join | R7, W1 |
| UNION ALL | R7 |
| FILTER on aggregates | R8, R9 |
| View | R3, Q6 (`top_movers`) |
| Vector similarity `<=>` | Q4, R7, R8, R9 |
| INSERT / UPDATE / DELETE … RETURNING | W2, W3, W4, W5 |

---

## A. Lookup and feature queries

### Q1 `companies_search.sql`: search and filter companies (GET `/api/companies?q=&sector=`)
Finds companies whose ticker *starts with* the search text or whose name *contains* it (case-insensitive `ILIKE`), optionally limited to a sector. `($1::text IS NULL OR …)` makes each filter optional while keeping one fixed, parameterised statement, with no SQL string building.
*Shows:* SELECT, WHERE with optional parameters, ILIKE, ORDER BY. *Result:* `q=bank` → BAC; `sector=Energy` → COP, CVX, EOG, OXY, PSX, SLB, XOM.

### Q2 `prices_for_company.sql`: price history of one company (GET `/api/prices?ticker=`)
Joins `prices` to `companies` by `cik` and returns every daily bar of one ticker, oldest first. The `(cik, trade_date)` primary-key index serves it.
*Shows:* JOIN, ORDER BY, composite-PK index use. *Result:* AAPL → 275 rows, 2025-09-22 … 2026-10-23, last close 347.73.

### Q3 `company_by_ticker.sql`: one company's details (header of `/search`).
*Shows:* simple SELECT by a UNIQUE column.

### Q4 `similar_companies.sql`: **vector similarity search**, top-5 description neighbours (GET `/api/similar`)
Orders all other companies by cosine distance (`<=>`) between their description embedding and the chosen company's, and returns the 5 nearest with similarity = 1 − distance. The query vector is an uncorrelated scalar subquery (evaluated once), which lets the HNSW index be used. See [vector-implementation.md](vector-implementation.md).
*Shows:* pgvector `<=>`, scalar subquery, ORDER BY + LIMIT (k-NN). *Result (JPM):* MS 0.635, GS 0.615, BAC 0.589, WFC 0.526, MA 0.460.

### Q5 `correlated_companies.sql`: **statistical similarity**, top-5 by 1-year return correlation (GET `/api/similar`)
1. Keep the last year of prices (`trade_date > max − 1 year`).
2. Daily return = `close / LAG(close) OVER (PARTITION BY cik ORDER BY trade_date) − 1`. `LAG` reads the *previous row of the same company*.
3. Self-join the returns on `trade_date` (aligning the target's return with every other company's on the same day).
4. `corr(target, other)` per company, top 5.

`regr_count` reports how many day-pairs were used.
*Shows:* CTE, window function `LAG`, self-JOIN, GROUP BY, aggregate `corr()`, subquery. *Result (JPM):* BAC 0.743, WFC 0.716, MS 0.621, GS 0.607, AXP 0.552 (250 days each). Overlap with Q4 = {MS, GS, BAC, WFC}, so Jaccard = 4/6 = **0.67**.

### Q6 `top_movers.sql`: the full `top_movers` view for the dashboard
Reads the view defined in `db/views.sql`. The view finds the two latest trading dates (Index Only Scan Backward on `idx_prices_trade_date`), joins each company's bar on both days, and computes `(close − prev_close) / prev_close × 100`, sorted descending.
*Shows:* querying a VIEW; CTE + JOINs inside the view. *Result:* 92 rows; top CCI +9.06%, bottom T −7.96% (2026-10-22 → 10-23).

### Q7 `auth/profile_by_user.sql`: the logged-in user's role
`SELECT … FROM profiles WHERE user_id = $1`, where `$1` is the id that Supabase Auth verified from the session cookie. Every API route uses this for authorisation (401/403).
*Shows:* lookup by primary key; server-side authorisation.

---

## B. Watchlist DML (each write runs inside a transaction, `lib/watchlist.ts`)

| # | File | Statement | Notes |
|---|---|---|---|
| W1 | `watchlist/list.sql` | SELECT + `CROSS JOIN LATERAL (… ORDER BY trade_date DESC LIMIT 1)` | Each entry with its company's latest close; LATERAL = "for each row, run this subquery". |
| W2 | `watchlist/insert.sql` | **INSERT** … RETURNING | Step 1 of *add*. A duplicate violates `watchlists_pkey` → 409; a viewer is blocked by trigger `watchlists_analyst_only` → 403. |
| W3 | `watchlist/log_action.sql` | **INSERT** into activity_log | Step 2 of every write, in the same transaction, so both commit or neither does. |
| W4 | `watchlist/update_note.sql` | **UPDATE** … `SET note = $3, updated_at = now()` | `updated_at` column was added by **ALTER** (migration 001); a note over 500 characters violates `watchlists_note_len` → 400. |
| W5 | `watchlist/delete.sql` | **DELETE** … RETURNING | No row → 404. |

Transaction flow (`lib/db.ts` `withTransaction`): `pool.connect()` → `BEGIN` → W2 → W3 → `COMMIT`; on any error `ROLLBACK`; finally `release()`. Proven in test T3.

---

## C. Reports (`/reports`, GET `/api/reports/<slug>`, files in `db/queries/reports/`)

### R1 `sector_summary.sql`: average close and average daily volume per sector
JOIN companies→prices, GROUP BY sector, `AVG(close)`, `AVG(volume)`, `COUNT(DISTINCT cik)` (distinct, because each company has 275 rows), ORDER BY volume.
*Shows:* **JOIN + GROUP BY + aggregates + ORDER BY.** *Result:* Technology highest volume (41.7 M shares/day, 12 companies); Real Estate lowest (3.1 M).

### R2 `sector_having.sql`: sectors with more than N companies and average 1-year % change above X
CTE 1 finds each company's first and last day in the last year; CTE 2 joins those two price rows to compute the % change; then GROUP BY sector with **`HAVING count(*) > $1 AND avg(pct_change) > $2`**. WHERE filters rows *before* grouping, HAVING filters *groups after* aggregation.
*Shows:* **HAVING**, CTEs, parameters. *Result (N=6, X=0):* 7 sectors, led by Energy +67.93% and ending with Financial Services +3.36%. Utilities and Real Estate are excluded because they have exactly 6 companies (not more than 6). With X = −100, Communication Services (−7.63%) and Consumer Cyclical (−10.16%) also appear.

### R3 `top_movers_top10.sql`: top 10 movers
`SELECT … FROM top_movers LIMIT 10`.
*Shows:* **querying a VIEW**. *Result:* CCI +9.06%, SLB +7.08%, AMT +4.08% … LMT +2.42%.

### R4 `above_own_average.sql`: latest close above the company's own average
Three **correlated subqueries**, i.e. inner SELECTs that refer to the outer row `c.cik`:
1. in the JOIN, picks the company's latest date;
2. in WHERE, keeps it only if that close beats its own average;
3. in SELECT, shows the average and the % above it.

*Shows:* **subqueries** (correlated, in JOIN/WHERE/SELECT). *Result:* 60 of 92 companies; PSX is furthest above its average (+59.98%), then AMD (+46.84%).

### R5 `most_watched.sql`: most-watched companies
JOIN watchlists→companies, GROUP BY, `COUNT(user_id)`, ORDER BY watchers.
*Shows:* **JOIN across the M:N table + GROUP BY.** *Result today:* JPM, MSFT, NVDA, XOM with 1 watcher each. There are few users, so this report is small.

### R6 `activity_summary.sql`: activity log per action
GROUP BY action with `COUNT(*)`, `COUNT(DISTINCT cik)`, `COUNT(DISTINCT user_id)` (which ignores NULLs, so trigger rows count 0 users), MIN/MAX time.
*Shows:* **GROUP BY + several aggregates.** *Result today:* PRICE_INSERT 466 (92 companies, 0 users: written by the trigger); WATCHLIST_ADD 5 (2 users); WATCHLIST_UPDATE 2; WATCHLIST_REMOVE 1.

### R7 `semantic_vs_statistical.sql`: **novelty report: does semantic similarity predict return correlation?**
1. Compute the return correlation of **all 4,186 unordered pairs** (`a.cik < b.cik` keeps each pair once), using LAG returns aligned by date.
2. Attach each pair's cosine similarity and a same-sector flag.
3. Build each company's top-5 semantic neighbours with `CROSS JOIN LATERAL (… ORDER BY <=> LIMIT 5)`, made unordered with `LEAST/GREATEST` + `DISTINCT`.
4. Draw a deterministic "random" sample of the same size, ordered by `md5`.
5. `UNION ALL` the groups and average.

*Shows:* window `LAG`, `corr()`, self-JOIN, LATERAL vector top-k, UNION ALL, GROUP BY, STDDEV. *Result:*

| Pair group | Pairs | Avg return corr | SD | Avg cosine sim |
|---|---|---|---|---|
| Semantic top-5 neighbours | 307 | **0.295** | 0.269 | 0.445 |
| …of which same sector | 154 | **0.461** | 0.227 | 0.485 |
| …of which different sector | 153 | **0.129** | 0.195 | 0.406 |
| Same-sector pairs | 356 | **0.321** | 0.235 | 0.375 |
| Random pairs (sample) | 307 | **0.095** | 0.188 | 0.217 |
| All pairs (baseline) | 4,186 | 0.102 | 0.186 | 0.223 |

**Honest reading:** description neighbours co-move about 3× more than random pairs, but *less* than plain same-sector pairs. Within a sector, embeddings pick out the closest movers (0.461 > 0.321). Across sectors they add almost nothing (0.129 vs ~0.10). Pairs share companies, so these are descriptive averages, not a significance test.

### R8 `semantic_vs_statistical_summary.sql`: one-number answers
Pearson correlation between cosine similarity and return correlation, overall and split with `FILTER (WHERE same_sector)` / `FILTER (WHERE NOT same_sector)`. Also the average Jaccard overlap of each company's two top-5 lists, using `ROW_NUMBER() OVER (PARTITION BY cik ORDER BY …)` ranks.
*Shows:* window ranking, aggregate FILTER, `corr()`. *Result:* corr overall **0.280**, within sector **0.537**, across sectors **0.075**; average Jaccard **0.288** (≈ 2 of 5 names shared; two random top-5 lists would score ≈ 0.03).

### R9 `sector_embedding_distance.sql`: **vector report: do embeddings capture sectors?**
Self-join every ordered pair of different companies. Per sector, average the cosine distance `<=>` to same-sector companies vs other-sector companies (`AVG … FILTER`), and their ratio.
*Shows:* pgvector `<=>` in aggregation, self-JOIN, FILTER. *Result:* within-sector distance is lower in **11 of 11** sectors; ratio cross/within ranges from 1.51 (Utilities) and 1.43 (Healthcare) down to 1.10 (Real Estate) and 1.08 (Basic Materials). The model never saw sector labels.

---

## D. Schema-level statements (not run by the app, but part of the implementation)
| File | Statements |
|---|---|
| `db/schema.sql` | CREATE EXTENSION, CREATE TABLE ×5 with PK/FK/UNIQUE/CHECK/NOT NULL/DEFAULT |
| `db/indexes.sql` | CREATE INDEX (B-tree, HNSW) |
| `db/views.sql` | CREATE OR REPLACE VIEW `top_movers` |
| `db/triggers.sql`, `db/auth_profiles.sql`, `db/role_enforcement.sql` | CREATE FUNCTION (PL/pgSQL), CREATE TRIGGER |
| `db/security.sql` | ALTER TABLE … ENABLE ROW LEVEL SECURITY |
| `db/migrations/001_…sql` | **ALTER TABLE** ADD COLUMN / ADD CONSTRAINT (in a transaction) |
| `db/migrations/002_…sql` | **DROP INDEX**, **DROP VIEW** |
| `db/admin/set_role.sql` | UPDATE profiles (promote a user) |
| `seed/load_data.py` | INSERT … ON CONFLICT DO UPDATE (upsert), COPY into a TEMP table, INSERT … SELECT … ON CONFLICT DO NOTHING |
