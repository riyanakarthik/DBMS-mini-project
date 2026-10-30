# EquiVector

**A Hybrid SQL–Vector Platform for Stock Market Analytics and Semantic Company Discovery**
PES University · DBMS Experiential Learning, Level 3 Project

Structured market data (prices, company identity, users, watchlists) lives in PostgreSQL tables. Company business descriptions are embedded with a sentence-transformer and stored in **pgvector** in the same database. The original angle of the project is **Semantic vs Statistical Similarity**: for any company we compare its nearest neighbours by *description meaning* (cosine distance in pgvector) with its nearest neighbours by *1-year daily-return correlation* (computed in SQL with `LAG` + `corr()`), and test whether semantic similarity predicts how stocks move together.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design log, and the [documentation](#documentation) below for the full write-up.

## Documentation
| Topic | File |
|---|---|
| Problem statement · Objectives · Scope | [docs/problem-statement.md](docs/problem-statement.md) · [docs/objectives.md](docs/objectives.md) · [docs/scope.md](docs/scope.md) |
| Functional requirements | [docs/functional-requirements.md](docs/functional-requirements.md) |
| ER diagram (Chen) · Relational schema + data dictionary | [docs/ER-diagram.png](docs/ER-diagram.png) ([source](docs/er-diagram.dot)) · [docs/data-dictionary.md](docs/data-dictionary.md) |
| Database choice and justification | [docs/database-choice-and-justification.md](docs/database-choice-and-justification.md) |
| Vector implementation (pgvector) | [docs/vector-implementation.md](docs/vector-implementation.md) |
| Important queries (every file in `db/queries/`) | [docs/important-queries.md](docs/important-queries.md) |
| System architecture | [docs/architecture.md](docs/architecture.md) |
| Testing results (real outputs) | [docs/testing-results.md](docs/testing-results.md) · raw logs in [docs/evidence/](docs/evidence/) |
| Screenshots | [docs/screenshots/](docs/screenshots/) |
| Conclusion and future work | [docs/conclusion-and-future-work.md](docs/conclusion-and-future-work.md) |
| Rubric checklist · Demo script | [docs/rubric-checklist.md](docs/rubric-checklist.md) · [docs/demo-script.md](docs/demo-script.md) |

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
- Node.js ≥ 20, npm (Node 22 recommended: supabase-js warns that Node 20 is deprecated)
- Python ≥ 3.10 (for `seed/`, Phase 1+)
- `psql` client
- A Supabase project (free tier), **or** a local PostgreSQL 15+ with the pgvector extension installed

### 1. Install
```bash
git clone <repo-url> && cd DBMS-mini-project
npm install
cp .env.local.example .env.local   # then fill in the values
```
The Python scripts and the app read `.env.local` themselves, but **`psql` does not**. In every terminal where you run the `psql "$DATABASE_URL" ...` commands below, first load it into the shell:
```bash
set -a; source .env.local; set +a
```
(Without this, `$DATABASE_URL` is empty and `psql` silently connects to your default local database.)

### 2. Database
**Supabase**
1. Create a project. Under *Database → Extensions*, enable **vector**.
2. Copy the connection string from *Project Settings → Database*. Use the **direct** (or session-mode, port 5432) string, **not** the transaction pooler (port 6543), because the watchlist feature uses real transactions. Put it in `DATABASE_URL` and set `DATABASE_SSL=true`.
3. Apply the schema:
   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/security.sql   # blocks Supabase's public REST API from the tables
   ```

**Local Postgres (alternative, database only)**
```bash
brew install pgvector            # macOS; or build from https://github.com/pgvector/pgvector
createdb equivector
psql -d equivector -f db/local/auth_stub.sql   # stands in for Supabase's auth.users
psql -d equivector -f db/schema.sql
# .env.local: DATABASE_URL=postgresql://localhost:5432/equivector  DATABASE_SSL=false
```
Logging in still needs a Supabase project (for Supabase Auth), so the full app with roles is only demoable on Supabase. A local database is enough for the seed pipeline, SQL scripts and tests.

Optional constraint check (on a **throwaway** DB, it inserts and deletes test rows): `createdb ev_scratch && psql -d ev_scratch -f db/local/auth_stub.sql -f db/schema.sql -f db/tests/constraints_test.sql && dropdb ev_scratch`.

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

### 4. Auth and roles
```bash
psql "$DATABASE_URL" -f db/auth_profiles.sql      # trigger: every new auth user gets a 'viewer' profile (+ backfill)
psql "$DATABASE_URL" -f db/role_enforcement.sql   # trigger: only analysts may write watchlists
psql "$DATABASE_URL" -v email=you@example.com -v role=analyst -f db/admin/set_role.sql   # promote a user
psql "$DATABASE_URL" -f db/tests/role_test.sql    # DB-level role tests (rolled back, leaves no trace)
```
On a local database (no Supabase Auth), create a stand-in user first: `psql "$DATABASE_URL" -c "insert into auth.users(email) values ('you@example.com')"`.

Sign up at `/signup` (or in the Supabase dashboard). New users are **viewers** (read-only: dashboard, search, reports, own watchlist); **analysts** can also add, edit and remove watchlist entries.

| Request | Not logged in | Viewer | Analyst |
|---|---|---|---|
| App pages | redirect to `/login` | yes | yes |
| `GET /api/*` (read) | **401** | 200 | 200 |
| `POST/PATCH/DELETE /api/watchlist` | **401** | **403** | 200/201 |

The role is read server-side from `profiles` for the user id that Supabase Auth verified from the session cookie, never from the request. End-to-end check against the running app (`npm run build && npm start` in another terminal; needs `TEST_*` logins in `.env.local`): `npm run test:roles` (expects `ALL 20 PASSED`).

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
npm run test:roles                                                   # HTTP 401/403/201 checks (app must be running)
npx tsx scripts/prove-rollback.ts analyst@gmail.com                  # forces 2 failed transactions as this ANALYST, shows nothing persisted
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
scripts/        run-sql.ts, prove-rollback.ts, test-roles.ts (run with npx tsx / npm run test:roles)
db/             schema/indexes/views/triggers/security/auth_profiles/role_enforcement .sql,
                queries/ (every SQL the app runs), migrations/, admin/, demo/, tests/, local/
middleware.ts   session refresh + login redirect (Supabase Auth via @supabase/ssr)
seed/           Python data + embedding pipeline (Phase 1–2)
docs/           project documentation, ER diagram, evidence/ (raw test outputs), screenshots/
```

## Team
| Member | Responsibility |
|---|---|
| Student A | Database: schema, seed pipeline, pgvector, triggers/views/indexes, SQL reports |
| Student B | Application: Next.js app, API routes, auth/roles, vector search UI, charts |
| Shared | Documentation, README |

## Contributions
*To be filled in by each student: list what you personally designed, wrote and tested, with the commits or files as evidence.*

| Student | Name / SRN | Database work | Application work | Docs / testing | Key commits / files |
|---|---|---|---|---|---|
| Student A | _name, SRN_ | _e.g. schema, constraints, seed pipeline, embeddings, view/trigger/index, report SQL_ | _…_ | _…_ | _…_ |
| Student B | _name, SRN_ | _…_ | _e.g. API routes, auth/roles, pages, charts, vector search UI_ | _…_ | _…_ |

## Status
- [x] Phase 0: scaffold, schema (5 tables + constraints), ER diagram, env template
- [x] Phase 1: seed pipeline (92 companies, batch 1 loaded)
- [x] Phase 2: embeddings, views, triggers, indexes, migrations (ALTER/DROP)
- [x] Phase 3: API routes + pages (dashboard, search, reports, watchlist), rollback proof, live trigger demo
- [x] Phase 4: Supabase Auth (login/signup/logout), profiles trigger, viewer/analyst roles enforced in API (401/403) and DB
- [x] Phase 5: documentation (`docs/`), rubric checklist, demo script, README verified on a fresh clone
