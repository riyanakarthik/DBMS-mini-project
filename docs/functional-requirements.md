# Functional Requirements

Each requirement lists where it is implemented. "Verified" points to the recorded test in [testing-results.md](testing-results.md).

## Authentication and roles
| ID | Requirement | Implemented in | Verified |
|---|---|---|---|
| FR-1 | Users can sign up and log in with email + password, and log out. | `app/login`, `app/signup`, `components/auth-form.tsx`, `components/nav.tsx` (Supabase Auth via `@supabase/ssr`) | T5 (logins via the same cookie flow) |
| FR-2 | Every new user automatically gets a profile with role `viewer`. | `db/auth_profiles.sql` (trigger `on_auth_user_created`) | T4 test 1, T6 (real signup) |
| FR-3 | Anonymous users cannot read data (API returns 401; pages redirect to `/login`). | `lib/auth.ts` `authorize()`, `middleware.ts` | T5 rows 0–2 |
| FR-4 | Viewers can read everything but cannot write (403). | `authorize("analyst")` on POST/PATCH/DELETE `/api/watchlist`; DB trigger `watchlists_analyst_only` | T5 rows 7–10, T4 test 5 |
| FR-5 | The role is decided by the server from `profiles`, never from the request. | `lib/auth.ts` + `db/queries/auth/profile_by_user.sql` | T5 row 8 (forged role → 403) |
| FR-6 | Only the values `analyst` / `viewer` are accepted as roles. | `profiles_role_check` CHECK, NOT NULL | T4 tests 2–4 |

## Market data and analytics (any logged-in user)
| ID | Requirement | Implemented in |
|---|---|---|
| FR-7 | Show the latest top movers (% change between the two latest trading days), filterable by sector, with a chart. | `/dashboard`, `/api/top-movers`, view `top_movers` |
| FR-8 | Show a sector view: average 1-year % change, average close and average volume per sector. | `/dashboard`, reports `sector-having`, `sector-summary` |
| FR-9 | Show the daily price history of any selected company. | `/dashboard`, `/api/prices`, `db/queries/prices_for_company.sql` |
| FR-10 | Search companies by ticker or name and filter by sector. | `/search`, `/api/companies`, `db/queries/companies_search.sql` |
| FR-11 | For a selected company, show its top-5 semantic neighbours (description embeddings, cosine). | `/api/similar`, `db/queries/similar_companies.sql` |
| FR-12 | For the same company, show its top-5 neighbours by 1-year daily-return correlation, the overlap, and the Jaccard score. | `/api/similar`, `db/queries/correlated_companies.sql` |
| FR-13 | Show nine analytical reports, each as a table and (where meaningful) a chart; the HAVING report takes user parameters N and X. | `/reports`, `/api/reports/[slug]`, `db/queries/reports/*.sql` |

## Watchlist (analyst writes, everyone reads their own)
| ID | Requirement | Implemented in | Verified |
|---|---|---|---|
| FR-14 | List the logged-in user's watchlist with each company's latest close. | `GET /api/watchlist`, `watchlist/list.sql` | T5 row 6 |
| FR-15 | Add a company with an optional note, **atomically** with an audit row (one transaction). | `POST /api/watchlist`, `lib/watchlist.ts`, `lib/db.ts withTransaction()` | T3, T5 row 16 |
| FR-16 | Edit a note (UPDATE, sets `updated_at`), audited. | `PATCH /api/watchlist` | T5 row 18 |
| FR-17 | Remove a company (DELETE), audited. | `DELETE /api/watchlist` | T5 row 15 |
| FR-18 | Reject duplicates (409) and notes over 500 characters (400) at database level. | `watchlists_pkey`, `watchlists_note_len` | T5 rows 17, 19 |

## Data pipeline and audit
| ID | Requirement | Implemented in | Verified |
|---|---|---|---|
| FR-19 | Load real data only. Bad rows are dropped and counted, never repaired or invented. | `seed/clean_data.py`, `seed/data/clean/clean_report.json` | Phase 1 run: 0 rows dropped |
| FR-20 | Every new price row updates the company's `last_updated` and writes an audit row automatically. | `db/triggers.sql` (`prices_after_insert`) | T2 |
| FR-21 | The system can be demonstrated live and repeatably without inventing prices. | `db/demo/fire_trigger_live.sql` | T2 |

## Non-functional
- **NFR-1 Security:** credentials only in env vars (`.env.local` is git-ignored); no `DATABASE_URL` in the browser bundle (checked in Phase 4); all SQL parameterised; RLS on all tables.
- **NFR-2 Integrity:** 25 named constraints, 3 triggers, transactions for multi-statement writes.
- **NFR-3 Explainability:** every SQL statement the app runs lives in a commented `db/queries/**/*.sql` file.
- **NFR-4 Performance:** report queries run in 0.2–1.9 s against Supabase (measured in Phase 3). The `top_movers` view uses `idx_prices_trade_date`, and similarity search can use the HNSW index (EXPLAIN in `docs/evidence/phase2_query_plans.txt`).
