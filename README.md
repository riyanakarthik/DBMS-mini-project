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

### 3. Seed data
```bash
cd seed && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Optional: re-download (needs network + SEC_USER_AGENT in .env.local).
# Skip this to use the committed real data in seed/data/clean/ (fetched 2026-10-25).
python fetch_data.py          # SEC CIKs + yfinance info + ~13 months of daily prices → data/raw/
python clean_data.py          # validate, drop bad rows (counted in clean_report.json) → data/clean/

python load_data.py --batch 1 # companies + prices up to the last week ("week 1")
# Phase 2: python embed_descriptions.py; python load_data.py --batch 2  (fires the prices trigger)
```
Data: 92 companies across 11 sectors, daily split/dividend-adjusted OHLCV from 2025-09-22 to 2026-10-23 (275 trading days). Batch 1 = 24,840 rows, batch 2 = the last 5 trading days (460 rows). Every load is a single transaction and safe to re-run.

### 4. Run
```bash
npm run dev
# open http://localhost:3000, and http://localhost:3000/api/health to check the DB connection
```

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
lib/db.ts       pg connection pool (env-var configured)
db/             schema.sql, indexes/views/triggers (Phase 2), migrations/, tests/, local/
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
- [ ] Phase 2: embeddings, views, triggers, indexes
- [ ] Phase 3: API routes + pages (dashboard, search, reports, watchlist)
- [ ] Phase 4: auth + roles
- [ ] Phase 5: documentation + rubric checklist
