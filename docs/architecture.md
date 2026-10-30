# System Architecture

## Components
```mermaid
flowchart LR
    subgraph Browser
        P["Next.js pages (React, shadcn/ui, Recharts)<br/>/dashboard /search /reports /watchlist<br/>/login /signup"]
        SBC["supabase-js browser client<br/>(auth only: sign in / up / out)"]
    end

    subgraph "Next.js server (Node)"
        MW["middleware.ts<br/>refresh session cookie,<br/>redirect anonymous page visits to /login"]
        API["API route handlers app/api/*<br/>companies · prices · top-movers · similar<br/>reports/[slug] · watchlist · me · health"]
        AUTH["lib/auth.ts authorize()<br/>401 / 403"]
        SQL["lib/sql.ts loadSql()<br/>reads db/queries/**/*.sql"]
        DB["lib/db.ts pg Pool<br/>query() · withTransaction()"]
    end

    subgraph "Supabase (hosted)"
        SA["Supabase Auth<br/>(password hashes, sessions)"]
        subgraph "PostgreSQL 17 + pgvector"
            T["tables: companies, prices, profiles,<br/>watchlists, activity_log"]
            V["view top_movers · triggers · RLS"]
            VEC["companies.description_embedding VECTOR(384)<br/>HNSW (vector_cosine_ops)"]
        end
    end

    subgraph "Offline seed pipeline (Python)"
        SEED["seed/fetch_data.py → clean_data.py → load_data.py<br/>embed_descriptions.py (all-MiniLM-L6-v2)"]
        SRC["SEC company_tickers.json<br/>yfinance"]
    end

    P -- "fetch /api/... (session cookie)" --> MW --> API
    SBC -- "email + password" --> SA
    API --> AUTH -- "verify cookie (getUser)" --> SA
    AUTH -- "role from profiles" --> DB
    API --> SQL --> DB
    DB -- "SQL over TLS, DATABASE_URL (server-only env var)" --> T
    T --- V
    T --- VEC
    SRC --> SEED -- "psycopg, one transaction per batch" --> T
```

## Request flow: page → API route → pg → Postgres
Example: an **analyst adds MSFT to their watchlist** (the full write path).

```mermaid
sequenceDiagram
    participant B as Browser (/watchlist page)
    participant M as middleware.ts
    participant R as POST /api/watchlist
    participant A as lib/auth.ts
    participant S as Supabase Auth
    participant D as lib/db.ts (pg Pool)
    participant PG as PostgreSQL

    B->>M: POST /api/watchlist {ticker:"MSFT", note} + session cookie
    M->>S: getUser() (refresh cookie if expired)
    M->>R: continue (API routes are not redirected)
    R->>A: authorize("analyst")
    A->>S: getUser(): verify session cookie → user id
    A->>D: profile_by_user.sql ($1 = verified user id)
    D->>PG: SELECT role FROM profiles WHERE user_id = $1
    PG-->>A: role = analyst (viewer → 403, no cookie → 401)
    R->>D: withTransaction()
    D->>PG: BEGIN
    D->>PG: SELECT cik FROM companies WHERE ticker = 'MSFT'
    D->>PG: INSERT INTO watchlists ... (trigger watchlists_analyst_only checks role)
    D->>PG: INSERT INTO activity_log ('WATCHLIST_ADD', cik, user_id)
    D->>PG: COMMIT   (any error → ROLLBACK, nothing persists)
    PG-->>R: new row
    R-->>B: 201 Created (409 duplicate, 400 bad note)
```

A **read** (e.g. `/reports`) follows the same path without the transaction: `authorize()` (any logged-in role) → `loadSql("reports/<file>.sql")` → `pool.query(text, params)` → JSON → the page renders a table and a Recharts chart.

## Layers and responsibilities
| Layer | Code | Responsibility |
|---|---|---|
| Presentation | `app/*/page.tsx`, `components/` | Client components; fetch JSON from the API; charts; hide write controls for viewers (cosmetic only) |
| Session | `middleware.ts`, `lib/supabase/` | Cookie sessions via `@supabase/ssr`; Supabase clients are used **only for auth** |
| API / backend | `app/api/**/route.ts`, `lib/api.ts` | Input checks, `authorize()`, mapping DB errors to HTTP (23505→409, 23514/23502/23503/22P02→400, 42501→403) |
| Data access | `lib/db.ts`, `lib/sql.ts`, `lib/watchlist.ts` | One `pg` Pool; parameterised SQL loaded from `db/queries`; `withTransaction()` |
| Database | `db/*.sql` | Schema, constraints, view, indexes, triggers, RLS, migrations |
| Data pipeline | `seed/*.py` | Offline fetch → clean → load → embed |

## Key design decisions
- **One database, two paradigms:** relational tables and pgvector embeddings live in the same Postgres, so vector distance and price statistics can be joined in one query ([database-choice-and-justification.md](database-choice-and-justification.md)).
- **`pg` driver, not supabase-js, for data:** raw SQL and real `BEGIN/COMMIT` on one pooled connection. `DATABASE_URL` is a session-mode connection string (transaction-mode pooling would break transactions) and is never prefixed `NEXT_PUBLIC_`, so it never reaches the browser. In Phase 4 the built browser bundle was checked: 0 files contain it.
- **All SQL in files:** `db/queries/**/*.sql`, one statement each, so what is shown in the viva is exactly what runs.
- **Defence in depth for roles:** API `authorize()` → 401/403, plus DB trigger `watchlists_analyst_only`, plus CHECK on `profiles.role`, plus RLS blocking the Supabase REST API.
- **No runtime calls to market APIs:** data is pre-seeded; the app only talks to Supabase.

## Deployment
Local for the demo: `npm run build && npm start` on http://localhost:3000, against the Supabase-hosted database (region and project in `.env.local`). The Python pipeline runs once from `seed/.venv`.
