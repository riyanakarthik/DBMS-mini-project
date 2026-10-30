# Scope

## In scope
| Area | What is included |
|---|---|
| Data | 92 large US companies across 11 yfinance sectors (6–12 per sector). Daily OHLCV prices, adjusted for splits and dividends, from **2025-09-22 to 2026-10-23** (275 trading days, 25,300 rows). One business description per company. CIKs from the SEC's `company_tickers.json`. |
| Loading | A one-off batch pipeline in Python (`seed/`): fetch, clean (rows are only ever dropped, never invented), load in two batches. Batch 2 (the last 5 trading days) simulates "new data arriving" so the trigger can be shown. |
| SQL database | PostgreSQL 17 on Supabase: 5 tables, constraints, 1 view, indexes, 3 triggers, migrations, RLS. |
| Vector database | pgvector in the same Postgres: `VECTOR(384)` embeddings of descriptions, HNSW cosine index, top-k retrieval. |
| Analytics | Top movers, sector statistics, HAVING/subquery reports, return correlations (`LAG` + `corr()`), semantic-vs-statistical comparison, embedding-vs-sector analysis. |
| Application | Next.js 15 web app: dashboard, semantic-vs-statistical search page, 9-report page, watchlist; login, signup and logout. |
| Users and roles | Supabase Auth (email + password). Roles `analyst` (read + write) and `viewer` (read-only). New users are viewers; an admin promotes them with SQL. |

## Out of scope (deliberately)
- **Live or real-time market data.** The app never calls a market API at runtime. All data is pre-seeded, and the "live" effect is the batch-2 load or the repeatable trigger demo.
- **Trading, portfolios and investment advice.** Watchlists are notes, not holdings. Nothing in the app is a recommendation.
- **Fundamentals** (earnings, P/E, balance sheets), intraday data, and non-US or small-cap stocks.
- **Embedding free-text user queries in the browser.** Search starts from an existing company; free-text query embedding would need a model server (see future work).
- **Production deployment.** The app runs locally (`npm run build && npm start`) against the Supabase-hosted database.
- **An admin UI for roles.** Roles are changed with `db/admin/set_role.sql` from psql.
