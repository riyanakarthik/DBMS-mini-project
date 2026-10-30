# 5-Minute Demo Script

## Before the demo (10 minutes earlier)
```bash
cd DBMS-mini-project
set -a; source .env.local; set +a        # so psql sees $DATABASE_URL
npm run build && npm start               # http://localhost:3000
```
- Open two browser windows: **A** logged in as `analyst@gmail.com`, **B** (private window) logged in as `riyanakarthik@gmail.com` (viewer).
- Open a terminal in the repo with the env loaded (above), and have `docs/ER-diagram.png` open.
- Optional check: `npm run test:roles` should end with `ALL 20 PASSED`. It re-adds MSFT to the analyst's watchlist, so remove MSFT afterwards if you want to add it live.

## Running order
| Time | Show | Say (one line) | Exact action |
|---|---|---|---|
| 0:00–0:30 | Problem | "Do companies that *describe* themselves alike also *move* alike? Prices are structured, so SQL; descriptions are text, so vectors." | Window A, home page. |
| 0:30–1:15 | ER + schema | "5 tables. PRICE is a weak entity, key (cik, trade_date). WATCHES is M:N with attributes. Constraints live in the DB." | Show `docs/ER-diagram.png`, then `db/schema.sql` (scroll to `prices_high_is_max`, `prices_trading_day`). |
| 1:15–1:45 | Dashboard | "Top movers come from a SQL view over the two latest days; sector view; price history." | A: `/dashboard`, pick NVDA in the price chart dropdown. |
| 1:45–2:45 | **Novelty** | "JPM: description neighbours vs return-correlation neighbours. 4 of 5 overlap, Jaccard 0.67. NVDA: only 2 overlap, its stock moves with GS and TSLA." | A: `/search`, click JPM, then NVDA. |
| 2:45–3:30 | Reports | "Across all 92 companies: semantic neighbours 0.295 vs same-sector 0.321 vs random 0.095. Embeddings find sector structure (11/11 sectors) but add little across sectors. That's an honest negative result." | A: `/reports`, jump to "Does semantic similarity predict…", then the vector report. Change HAVING N=6, X=−100 → Run. |
| 3:30–4:15 | Transaction + roles | "An analyst add is BEGIN, INSERT watchlist, INSERT activity_log, COMMIT. The viewer has no write controls, and the API returns 403 anyway." | A: `/watchlist`, add `KO` with a note, edit the note, remove it. B: `/watchlist`, read-only banner. Terminal: `npx tsx scripts/prove-rollback.ts analyst@gmail.com` (PASS). |
| 4:15–5:00 | **Live trigger** | "Inserting price rows fires an AFTER INSERT trigger: last_updated changes and activity_log grows, with real prices re-inserted." | Terminal: `psql "$DATABASE_URL" -f db/demo/fire_trigger_live.sql` (point at BEFORE/AFTER counts). Then A: `/reports` → Activity log summary shows PRICE_INSERT +2. |

Backup if the network fails: show the recorded outputs in `docs/evidence/` and `docs/testing-results.md`.

## 10 likely questions, with short honest answers
1. **Why pgvector and not MongoDB or Pinecone?** The embedding belongs to the company row, and our main feature joins vector distance with price correlations in one SQL query. A separate store would need two systems and app-side joins. pgvector is listed under Option 2.
2. **What exactly is embedded, and how?** Only each company's business description, using all-MiniLM-L6-v2: 384 dimensions, normalised to length 1, run once locally. Sector labels are not embedded, so the sector report isn't circular.
3. **Why cosine, and what does HNSW do?** Cosine compares meaning regardless of text length; operator `<=>`. HNSW is a graph index for approximate nearest neighbours, and its opclass `vector_cosine_ops` must match the operator. At 92 rows Postgres often just scans, but EXPLAIN with seqscan off shows the index path gives identical results.
4. **Show me a transaction. What if it fails half-way?** `lib/db.ts withTransaction` runs BEGIN/COMMIT on one pooled connection, with ROLLBACK in catch. `prove-rollback.ts` forces two failures, and neither row persists. The log_id sequence still skips numbers, because sequences aren't transactional.
5. **How is a viewer stopped from writing?** Three layers: the API checks the role from `profiles` for the verified session user (403); a BEFORE trigger on watchlists rejects non-analysts (SQLSTATE 42501); hiding buttons is only cosmetic. Our test forged `role: analyst` in the request and still got 403.
6. **Where are passwords stored?** Not by us. Supabase Auth stores hashes; our `profiles` table has no credential column. DB credentials are only in `.env.local`, which is git-ignored and never `NEXT_PUBLIC_`.
7. **Why is `prices` keyed by (cik, trade_date) with no id?** It's a weak entity: a bar is identified by its company and date. The PK index also serves per-company lookups, which is why we dropped a redundant `prices(cik)` index in migration 002.
8. **How is the correlation computed?** `LAG(close) OVER (PARTITION BY cik ORDER BY trade_date)` gives the previous close, so return = close/prev − 1. We self-join on trade_date to align days, then `corr()`. That's about 250 daily returns per pair.
9. **Did semantic similarity predict correlation?** Partly, and mostly through sector: 0.295 vs 0.321 for same-sector pairs. Within a sector it's useful (0.461); across sectors it's near random (0.129). We report that as it is.
10. **What are the limitations?** 92 companies and one year of data; 60% of descriptions are truncated at 256 tokens; a small general model; sector is not normalised; descriptive statistics only. See `docs/conclusion-and-future-work.md`.
