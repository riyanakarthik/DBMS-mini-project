# EquiVector

**A Hybrid SQL–Vector Platform for Stock Market Analytics and Semantic Company Discovery**
PES University · DBMS Experiential Learning, Level 3 Project

Structured market data (prices, company identity, users, watchlists) lives in PostgreSQL tables. Company business descriptions are embedded with a sentence-transformer and stored in **pgvector** in the same database. The original angle of the project is **Semantic vs Statistical Similarity**: for any company we compare its nearest neighbours by *description meaning* (cosine distance in pgvector) with its nearest neighbours by *1-year daily-return correlation* (computed in SQL with `LAG` + `corr()`), and test whether semantic similarity predicts how stocks move together.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design, and [docs/er-diagram.dot](docs/er-diagram.dot) for the Chen-notation ER diagram.

## Tech stack
| Layer | Choice |
|---|---|
| Frontend + API | Next.js 15 (App Router, TypeScript), shadcn/ui, Tailwind |
| SQL database | PostgreSQL (hosted on Supabase) |
| Vector database | pgvector extension: `VECTOR(384)`, cosine `<=>`, HNSW index |
| DB access | `pg` driver, raw parameterised SQL, `DATABASE_URL` env var |
| Auth | Supabase Auth + `profiles.role` (`analyst` / `viewer`) |
| Data + embeddings | Python: yfinance, SEC `company_tickers.json`, sentence-transformers `all-MiniLM-L6-v2` |

## Setup

### Prerequisites
- Node.js ≥ 20, npm
- Python ≥ 3.10 (for `seed/`, Phase 1+)
- `psql` client
- A Supabase project (free tier), **or** a local PostgreSQL 15+ with the pgvector extension installed

### 1. Install
```bash
git clone <repo-url> && cd DBMS-mini-project
npm install
cp .env.local.example .env.local   # then fill in the values
```

### 2. Database
**Supabase**
1. Create a project. Under *Database → Extensions*, enable **vector**.
2. Copy the connection string from *Project Settings → Database*. Use the **direct** (or session-mode, port 5432) string, **not** the transaction pooler (port 6543), because the watchlist feature uses real transactions. Put it in `DATABASE_URL` and set `DATABASE_SSL=true`.
3. Apply the schema:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/security.sql   # blocks Supabase's public REST API from the tables
   ```

**Local Postgres (alternative)**
```bash
brew install pgvector            # macOS; or build from https://github.com/pgvector/pgvector
createdb equivector
psql -d equivector -f db/local/auth_stub.sql   # stands in for Supabase's auth.users
psql -d equivector -f db/schema.sql
# .env.local: DATABASE_URL=postgresql://localhost:5432/equivector  DATABASE_SSL=false
```

Optional constraint check (on a throwaway DB): `psql -d <scratch_db> -f db/tests/constraints_test.sql`.

### 3. Seed data, indexes, views, triggers
Run in this exact order to reproduce the demo state. The trigger is installed
**after** batch 1, so only batch 2 produces activity_log rows (460, not 25,300).
```bash
cd seed && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: re-download (needs network + SEC_USER_AGENT in .env.local).
# Skip this to use the committed real data in seed/data/clean/ (fetched 2026-10-25).
python fetch_data.py          # SEC CIKs + yfinance info + ~13 months of daily prices → data/raw/
python clean_data.py          # validate, drop bad rows (counted in clean_report.json) → data/clean/

python load_data.py --batch 1 # companies + prices up to 2026-10-16 ("week 1")
python embed_descriptions.py  # all-MiniLM-L6-v2 → companies.description_embedding (first run downloads ~90 MB model)
cd ..
psql "$DATABASE_URL" -f db/indexes.sql      # idx_prices_trade_date + HNSW cosine index
psql "$DATABASE_URL" -f db/views.sql        # top_movers
psql "$DATABASE_URL" -f db/triggers.sql     # AFTER INSERT ON prices
psql "$DATABASE_URL" -f db/migrations/001_watchlists_add_updated_at.sql   # ALTER demo
psql "$DATABASE_URL" -f db/migrations/002_drop_redundant_index.sql        # DROP demo

psql "$DATABASE_URL" -f db/tests/trigger_snapshot.sql   # "before" snapshot
(cd seed && .venv/bin/python load_data.py --batch 2)    # last 5 trading days → trigger fires
psql "$DATABASE_URL" -f db/tests/trigger_snapshot.sql   # "after": activity_log 0 → 460, top_movers moves on a week
```
Data: 92 companies across 11 sectors, daily split/dividend-adjusted OHLCV from 2025-09-22 to 2026-10-23 (275 trading days). Batch 1 = 24,840 rows, batch 2 = the last 5 trading days (460 rows). Every load is a single transaction and safe to re-run. Recorded outputs are in `docs/evidence/`.

Semantic neighbours of any company: `npx tsx scripts/run-sql.ts db/queries/similar_companies.sql JPM` (the query files use `$1` parameters, like the API).

### 4. Demo user (temporary, until Phase 4 auth)
```bash
psql "$DATABASE_URL" -f db/demo/create_demo_user.sql   # prints a UUID
# put it in .env.local as DEMO_USER_ID=<uuid>
```

### 5. Run
```bash
npm run dev
# http://localhost:3000            pages: /dashboard /search /reports /watchlist
# http://localhost:3000/api/health DB connectivity check
```

| Page | What it shows | Backed by |
|---|---|---|
| `/dashboard` | top movers (view), sector view, price chart per company | `/api/top-movers`, `/api/reports/sector-*`, `/api/prices` |
| `/search` | **Semantic vs statistical**: top-5 description neighbours (pgvector) next to top-5 return correlations (`LAG` + `corr()`), overlap + Jaccard | `/api/similar` |
| `/reports` | 9 analytical reports, each one SQL file in `db/queries/reports/`, as table + chart | `/api/reports/<name>` |
| `/watchlist` | add (transaction), edit note (UPDATE), remove (DELETE) | `/api/watchlist` |

### 6. Useful scripts
```bash
npx tsx scripts/run-sql.ts db/queries/correlated_companies.sql JPM   # run any query file; extra args = $1, $2...
npx tsx scripts/prove-rollback.ts                                    # forces 2 failed transactions, shows nothing persisted
psql "$DATABASE_URL" -f db/demo/fire_trigger_live.sql                # LIVE trigger demo (repeatable; -v ticker=NVDA)
```
`fire_trigger_live.sql` deletes a company's 2 latest real price rows and re-inserts the identical values inside one transaction, so the `AFTER INSERT` trigger visibly fires (activity_log +2, new `last_updated`) without inventing any prices.

### ER diagram
Render `docs/er-diagram.dot` with Graphviz:
```bash
brew install graphviz
dot -Kneato -Tpng -Gdpi=150 docs/er-diagram.dot -o docs/ER-diagram.png
```
Or paste the file into any online Graphviz viewer, with the engine set to *neato*.

## Repository layout
```
app/            Next.js pages and API routes (app/api/*/route.ts)
components/ui/  shadcn/ui components
lib/            db.ts (pg pool + withTransaction), sql.ts (loads db/queries/*.sql), reports.ts, watchlist.ts
scripts/        run-sql.ts, prove-rollback.ts (run with npx tsx)
db/             schema/indexes/views/triggers/security .sql, queries/ (every SQL the app runs), migrations/, demo/, tests/, local/
seed/           Python data + embedding pipeline (Phase 1–2)
docs/           ER diagram and project documentation
```

## Team
| Member | Responsibility |
|---|---|
| Student A | Database: schema, seed pipeline, pgvector, triggers/views/indexes, SQL reports |
| Student B | Application: Next.js app, API routes, auth/roles, vector search UI, charts |
| Shared | Documentation, README |

## Status
- [x] Phase 0: scaffold, schema (5 tables + constraints), ER diagram, env template
- [x] Phase 1: seed pipeline (92 companies, batch 1 loaded)
- [x] Phase 2: embeddings, views, triggers, indexes, migrations (ALTER/DROP)
- [x] Phase 3: API routes + pages (dashboard, search, reports, watchlist), rollback proof, live trigger demo
- [ ] Phase 4: auth + roles
- [ ] Phase 5: documentation + rubric checklist
