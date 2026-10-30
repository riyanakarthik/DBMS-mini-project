# Testing Results

All results below are **real outputs** from runs on **2026-10-30** (UTC), unless marked otherwise. Full raw outputs are in [`docs/evidence/`](evidence/). Nothing here was typed by hand.

| ID | What is tested | Where it ran | Script | Result |
|---|---|---|---|---|
| T1 | Constraints (CHECK, UNIQUE, FK, PK, CASCADE) | throwaway local PostgreSQL 17 + pgvector | `db/tests/constraints_test.sql` | **PASS**: 10/10 invalid rows rejected, 4 valid accepted, cascade OK |
| T2 | Trigger `prices_after_insert` (live, repeatable) | Supabase | `db/demo/fire_trigger_live.sql` | **PASS**: activity_log +2, `last_updated` changed, prices unchanged |
| T3 | Transaction atomicity (rollback) | Supabase | `scripts/prove-rollback.ts` | **PASS**: nothing persisted from 2 failed transactions |
| T4 | Roles at DB level + signup trigger | Supabase (rolled back) | `db/tests/role_test.sql` | **PASS**: 7/7 |
| T5 | Roles over HTTP: 401 / 403 / 201 + validation | production build + Supabase | `npm run test:roles` | **PASS**: 20/20 (the first run failed 5/20; see below) |
| T6 | Signup trigger on a real Supabase signup | Supabase | observation | **PASS** |
| T7 | Batch-2 trigger + view update (Phase 2, 2026-10-25) | Supabase | `seed/load_data.py --batch 2` + `db/tests/trigger_snapshot.sql` | **PASS**: activity_log 0 → 460 |
| T8 | ALTER / DROP migrations (Phase 2, 2026-10-25) | Supabase | `db/migrations/*.sql` | **PASS** |
| T9 | Index usage (EXPLAIN, Phase 2) | Supabase | `docs/evidence/phase2_query_plans.txt` | **PASS** |
| T10 | README followed literally on a fresh clone | fresh clone + new local DB | this document, §T10 | **PASS after 1 fix** |
| T11 | Build / lint / types | local | `npm run build`, `npm run lint`, `tsc --noEmit` | **PASS** |

---

## T1: Constraint tests
Evidence: [`phase5_T1_constraints.txt`](evidence/phase5_T1_constraints.txt). It runs on a throwaway local DB because it inserts and deletes an AAPL row.

| # | Input | Expected | Actual |
|---|---|---|---|
| 1 | valid company AAPL | accepted | `INSERT 0 1` |
| 2 | CIK `320193` (not 10 digits) | reject | `violates check constraint "companies_cik_format"` |
| 3 | ticker `aapl` (lower case) | reject | `violates check constraint "companies_ticker_format"` |
| 4 | second company with ticker AAPL | reject | `duplicate key value violates unique constraint "companies_ticker_key"` |
| 5 | valid price on Friday 2025-10-24 | accepted | `INSERT 0 1` |
| 6 | price on Saturday 2025-10-25 | reject | `violates check constraint "prices_trading_day"` |
| 7 | high (9) below open (10) | reject | `violates check constraint "prices_high_is_max"` |
| 8 | volume −1 | reject | `violates check constraint "prices_volume_nonneg"` |
| 9 | price for unknown CIK | reject | `violates foreign key constraint "prices_cik_fkey"` |
| 10 | profile with role `admin` | reject | `violates check constraint "profiles_role_check"` |
| 11 | profile with no role | default `viewer` | `INSERT 0 1`; role = viewer |
| 12 | same company watched twice | reject | `duplicate key value violates unique constraint "watchlists_pkey"` |
| 13 | activity_log action `HACK` | reject | `violates check constraint "activity_log_action_check"` |
| 14 | DELETE the company | cascades to prices + watchlists | `DELETE 1`, then prices = 0, watchlists = 0 |

## T2: Trigger fires on INSERT (live demo script)
Evidence: [`phase5_T2_trigger.txt`](evidence/phase5_T2_trigger.txt). The script deletes AAPL's two latest real price rows and re-inserts the identical values inside one transaction, so no price is invented.
```
=== BEFORE ===   AAPL last_updated 2026-10-25 14:45:24+00 | activity_log_rows 470 | price_insert_rows 464
=== INSERT 2 price rows ===   INSERT 0 2
=== AFTER ===    AAPL last_updated 2026-10-30 13:39:34+00 | activity_log_rows 472 | price_insert_rows 466
newest rows: 476 PRICE_INSERT AAPL (user_id NULL), 475 PRICE_INSERT AAPL (user_id NULL)
prices unchanged afterwards: AAPL 2026-10-23 347.73, 2026-10-22 348.22; total 25,300
```

## T3: Transaction rollback
Evidence: [`phase5_T3_rollback.txt`](evidence/phase5_T3_rollback.txt). It uses the app's own `withTransaction()` and insert statements.
```
running as analyst@gmail.com (51507cb2-...)
before: { watchlist_rows: 0, activity_log_rows: 472, ko_on_watchlist: false }
  scenario 1: inside the transaction the new row IS visible (watchlist rows = 1)
  scenario 1 failed as intended: forced failure after both INSERTs, before COMMIT
after scenario 1: { watchlist_rows: 0, activity_log_rows: 472, ko_on_watchlist: false }
  scenario 2 failed as intended: new row for relation "activity_log" violates check constraint "activity_log_action_check"
after scenario 2: { watchlist_rows: 0, activity_log_rows: 472, ko_on_watchlist: false }
PASS: nothing persisted from either failed transaction
```
(This ran at 13:39 UTC as the *old* analyst account `51507cb2…`, which was deleted and re-created a few minutes later; see T6.)

## T4: Roles at database level
Evidence: [`phase5_T4_role_db.txt`](evidence/phase5_T4_role_db.txt). Everything runs in one transaction that is rolled back.

| # | Test | Expected | Actual |
|---|---|---|---|
| 1 | insert a new `auth.users` row | trigger creates a `viewer` profile | `role-test | viewer` |
| 2 | UPDATE role to `admin` | reject | `violates check constraint "profiles_role_check"` |
| 3 | INSERT profile with role `superuser` | reject | `violates check constraint "profiles_role_check"` |
| 4 | INSERT profile with NULL role | reject | `null value in column "role" … violates not-null constraint` |
| 5 | watchlist row for a viewer | reject | `only analysts can modify watchlists (user …)` (trigger, SQLSTATE 42501) |
| 6 | same insert after promotion to analyst | accepted | `INSERT 0 1` |
| 7 | after ROLLBACK | nothing left | `leftover_test_users = 0` |

## T5: Roles over HTTP (real logins)
Evidence: [`phase5_T5_http_roles.txt`](evidence/phase5_T5_http_roles.txt). The script logs in through Supabase Auth exactly as the browser does (session cookies from `@supabase/ssr`) and calls the running production build. Viewer = riyanakarthik@gmail.com (role viewer); analyst = analyst@gmail.com (role analyst).

| # | Who | Request | Expected | Actual |
|---|---|---|---|---|
| 0–2 | anonymous | GET /api/top-movers, GET /api/watchlist, POST /api/watchlist | 401 | 401, 401, 401 |
| 3–6 | viewer | GET /api/me, /api/reports/sector-summary, /api/similar?ticker=JPM, /api/watchlist | 200 | 200 ×4 |
| 7 | viewer | POST /api/watchlist {MSFT} | 403 | 403 |
| 8 | viewer, **forged** `"role":"analyst"` in body + `x-user-role: analyst` header | POST /api/watchlist | 403 | 403 |
| 9–10 | viewer | PATCH, DELETE /api/watchlist | 403 | 403, 403 |
| 11 | viewer | GET /api/reports/sector-having?min_companies=abc | 400 | 400 |
| 12 | viewer | GET /api/similar?ticker=ZZZZ | 404 | 404 |
| 13–14 | analyst | GET /api/me, /api/companies?q=MSFT | 200 | 200, 200 |
| 15 | analyst | DELETE MSFT (cleanup) | 200/404 | 404 (not present) |
| 16 | analyst | POST /api/watchlist {MSFT, note} | **201** | **201** |
| 17 | analyst | POST MSFT again | 409 (PK) | 409 |
| 18 | analyst | PATCH note | 200 | 200 |
| 19 | analyst | PATCH note of 501 chars | 400 (CHECK) | 400 |

`ALL 20 PASSED`. The audit rows written by the analyst's transactions carry the **real user id**:
```
log_id | action           | ticker | user_id                              | email
480    | WATCHLIST_UPDATE | MSFT   | 935177c8-677a-4f88-8037-60df34fbc29e | analyst@gmail.com
479    | WATCHLIST_ADD    | MSFT   | 935177c8-677a-4f88-8037-60df34fbc29e | analyst@gmail.com
```
**Failed first run (13:44 UTC), reported for honesty:** 5 analyst checks returned 403 instead of 201/200/409/400, because `/api/me` reported the analyst as `viewer`. The cause was found in the database: the analyst@gmail.com account had been deleted and re-created in Supabase at 13:44:03, so the signup trigger had (correctly) given the new account the default `viewer` role. After re-promoting it with `db/admin/set_role.sql`, the re-run passed 20/20. This also shows that a viewer cannot write even when the client claims otherwise.

## T6: Signup trigger on a real Supabase signup
Evidence: [`phase5_T6_signup_trigger.txt`](evidence/phase5_T6_signup_trigger.txt).
```
id 935177c8-…  analyst@gmail.com | auth_user_created 2026-10-30 13:44:03.279693+00 | profile_created 13:44:03.277632+00 | role viewer
```
The profile was created in the same transaction as the Supabase Auth user, by `on_auth_user_created`, with the default role `viewer`. (The two users that existed before the trigger was installed, 2026-10-26, got profiles from the backfill in `db/auth_profiles.sql`; see `phase4_auth_profiles.txt`.)

## T7: Batch-2 load fires the trigger and moves the view (2026-10-25)
Evidence: [`phase2_trigger_before.txt`](evidence/phase2_trigger_before.txt), [`phase2_trigger_after.txt`](evidence/phase2_trigger_after.txt).

| | Before | After loading 460 rows |
|---|---|---|
| activity_log | 0 | 460 PRICE_INSERT (5 per company × 92, user_id NULL) |
| latest trade date | 2026-10-16 | 2026-10-23 |
| top_movers #1 | EOG +4.23% | CCI +9.06% |

## T8: Migrations (2026-10-25)
Evidence: [`phase2_migrations.txt`](evidence/phase2_migrations.txt). Migration 001 (ALTER) added `watchlists.updated_at` and the CHECK constraint; re-running it is a no-op. Migration 002 (DROP) showed the redundant `idx_prices_cik` (200 kB) and dropped it; lookups by cik still use `Index Scan using prices_pkey`. It also dropped the scratch view, leaving only `top_movers`.

## T9: Index usage (EXPLAIN)
Evidence: [`phase2_query_plans.txt`](evidence/phase2_query_plans.txt).
- `top_movers`: `Index Only Scan Backward using idx_prices_trade_date`.
- Similar companies (with `enable_seqscan=off`): `Index Scan using idx_companies_embedding … Order By: (description_embedding <=> (InitPlan 1).col1)`. The results were identical to the exact scan.

## T10: README followed literally on a fresh clone (today)
A fresh `git clone` of commit `e1ee367` was set up with a **new local** database by following the README word for word:
- `npm install` and `pip install -r requirements.txt` succeeded;
- schema applied; constraint check rejected 10 rows;
- seed batch 1: 24,840 rows; 92 embeddings with norm 1.0000;
- indexes, views and triggers applied; migrations ran;
- batch 2: activity_log 0 → 460;
- similar_companies(JPM) → MS 0.635;
- role promotion worked; rollback proof PASS; live trigger demo 460 → 462;
- `npm run build` OK; `/api/health` → `{"ok":true, …, "pgvector":"0.8.7"}`;
- anonymous `/api/top-movers` → 401; `/dashboard` → 307 redirect to `/login`;
- ER diagram rendered.

**Problems found and fixed:**
1. The README did not say to load `.env.local` into the shell before `psql "$DATABASE_URL"`. Without it, psql silently uses a default local database. Fixed with a `set -a; source .env.local; set +a` instruction.
2. `db/tests/role_test.sql` failed tests 1, 3 and 6 on a local DB, because the local `auth.users` stub lacked the `aud`/`role` columns. Fixed in `db/local/auth_stub.sql`; re-run 7/7.
3. `scripts/prove-rollback.ts` needs an analyst email argument on a database without analyst@gmail.com; documented.

## T11: Build, lint, types
`npm run build` → `✓ Compiled successfully`; `npm run lint` → no problems; `npx tsc --noEmit` → no errors.

## Known gaps in testing (honest)
- **No automated browser (UI) tests.** Pages were checked with static headless-Chrome screenshots (Phase 3) and by API calls. Buttons, forms and hover tooltips were not clicked by a test tool.
- **The signup confirmation email flow** (`/auth/callback`) was not exercised; it depends on Supabase Auth email settings.
- **No load or performance tests.** Timings quoted elsewhere are single runs.
- The semantic-vs-statistical comparison is **descriptive**: no significance test, and pairs are not independent.
