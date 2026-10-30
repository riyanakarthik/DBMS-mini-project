# CLAUDE.md: EquiVector conventions

PES University DBMS Level 3 project, 2-person team. **ARCHITECTURE.md is the design source of truth**; the requirements PDF in the repo root is the grading rubric. Re-check against it after every phase.

## Stack
- Next.js 15 (App Router, TypeScript) + Tailwind v4 + shadcn/ui (`components/ui/`).
- PostgreSQL on Supabase + pgvector. Supabase is **only** the Postgres host and Auth provider.
- All SQL goes through the `pg` driver (`lib/db.ts`) using `DATABASE_URL`. Do not use supabase-js for data queries.
- Seed and embedding scripts are Python in `seed/` (yfinance, SEC `company_tickers.json`, sentence-transformers).

## Rules
- **Raw SQL is intentional** (graded). No ORM. DDL, views, triggers, indexes, migrations and report queries live in `db/*.sql` and are heavily commented. Students must be able to explain every line.
- **All app SQL lives in `db/queries/**/*.sql`** (one statement per file, `$1..$n` params) and is loaded with `loadSql()` from `lib/sql.ts`. Don't inline SQL in routes.
- `lib/db.ts` parses DATE as 'YYYY-MM-DD' strings and NUMERIC/BIGINT as numbers (avoids the timezone off-by-one-day bug).
- **Parameterised queries only** (`$1, $2`). Never concatenate user input into SQL.
- **Validate in the database** (NOT NULL, CHECK, FK, UNIQUE, named constraints) as well as in the app.
- **Transactions**: use one client from the pool (`pool.connect()`), `BEGIN` / `COMMIT`, `ROLLBACK` in `catch`, `release()` in `finally`. Requires a direct or session-mode connection string, not transaction-mode pooling.
- **Secrets only via env vars.** `.env.local` is git-ignored; `.env.local.example` is committed. No passwords are stored by us (Supabase Auth handles them).
- **Never fabricate data or results.** If yfinance/network fails, say so and use the checked-in sample CSV. Report analytical findings honestly, including negative ones.
- Vector search uses **cosine** distance: operator `<=>`, HNSW index with `vector_cosine_ops`, embeddings from all-MiniLM-L6-v2 (384-dim, normalised).
- Roles: `profiles.role IN ('analyst','viewer')`. Analyst can write, viewer is read-only. Enforce in API routes AND in the DB.
- Every data API route starts with `authorize()` (read) or `authorize("analyst")` (write) from `lib/auth.ts`: 401 no session, 403 wrong role. User id and role come only from the verified session + `profiles`, never from the request. Supabase clients (`lib/supabase/`) are for auth only.

## Layout
- `app/` pages + `app/api/*/route.ts` (backend layer). `lib/db.ts` is the pg pool.
- `db/schema.sql` → `indexes.sql` → `views.sql` → `triggers.sql`; `db/migrations/` for ALTER/DROP; `db/local/` for local-only helpers; `db/tests/` for SQL test scripts.
- `seed/` Python pipeline, `seed/data/` CSVs. `docs/` project documentation (`er-diagram.dot` is Chen notation).

## Team / git
- Student A: `db/`, `seed/`, Postgres/pgvector, triggers/views/indexes, SQL reports.
- Student B: Next.js app, API routes, auth/roles, vector search API + UI, charts.
- Shared: `docs/`, README. Separate branches, conventional-commit messages (`feat(db): ...`, `feat(app): ...`, `docs: ...`).
- The students commit themselves. Do not run `git commit`.

## Commands
- `npm run dev`: app on http://localhost:3000 (`/api/health` checks DB connectivity).
- `npm run lint`, `npm run build`.
- `psql "$DATABASE_URL" -f db/schema.sql`: apply schema.
- `npx tsx scripts/run-sql.ts <file.sql> [params]`: run a db/queries file exactly as the API does.
- `npx tsx scripts/test-roles.ts`: HTTP 401/403/201 role checks against the running app (needs TEST_* logins in .env.local).
- `npx tsx scripts/prove-rollback.ts`: transaction rollback proof. `psql "$DATABASE_URL" -f db/demo/fire_trigger_live.sql`: live trigger demo.
