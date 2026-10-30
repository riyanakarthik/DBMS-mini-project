# Data Dictionary and Relational Schema

Generated from the **live Supabase database** (`information_schema` and `pg_constraint`, 2026-10-30), so it matches what is deployed. The DDL is in [`db/schema.sql`](../db/schema.sql), plus [`db/migrations/001_watchlists_add_updated_at.sql`](../db/migrations/001_watchlists_add_updated_at.sql).

## Relational schema (from the ER diagram)
Primary keys are **bold**, foreign keys are *italic*.

```
COMPANIES   (**cik**, ticker, name, sector, industry, description, description_embedding, last_updated)
PRICES      (***cik***, **trade_date**, open, high, low, close, volume)          cik → COMPANIES
PROFILES    (***user_id***, display_name, role, created_at)                     user_id → auth.users (Supabase)
WATCHLISTS  (***user_id***, ***cik***, note, created_at, updated_at)            user_id → PROFILES, cik → COMPANIES
ACTIVITY_LOG(**log_id**, action, *cik*, *user_id*, logged_at)                    cik → COMPANIES, user_id → PROFILES
```

ER → relational mapping (see [ER-diagram.png](ER-diagram.png), Chen notation):
| ER element | Becomes |
|---|---|
| Entity COMPANY | table `companies`, key `cik` |
| **Weak** entity PRICE + identifying relationship HAS_PRICE (1:N, total participation) | table `prices` with composite PK `(cik, trade_date)`: owner key + partial key. FK `ON DELETE CASCADE`, because a price cannot exist without its company. |
| Entity PROFILE | table `profiles`, key `user_id` (1:1 with Supabase `auth.users`) |
| M:N relationship WATCHES with attributes note, created_at | table `watchlists`, PK = both FKs `(user_id, cik)` |
| Entity ACTIVITY_LOG + relationships LOGGED_FOR (N:1, optional) and PERFORMED_BY (N:1, optional) | table `activity_log` with nullable FKs `cik`, `user_id` (`ON DELETE SET NULL` keeps history) |

Normal form: every table is in 3NF except one known, deliberate case. In `companies`, `industry → sector` is a transitive dependency (`sector` is repeated text). It is kept because it is read-only reference data loaded in one batch; see [conclusion-and-future-work.md](conclusion-and-future-work.md).

---

## 1. `companies`: one row per listed company (92 rows)
| Column | Type | Null | Default | Constraints | Why |
|---|---|---|---|---|---|
| cik | varchar(10) | NOT NULL | | **PK** `companies_pkey`; CHECK `companies_cik_format` `~ '^[0-9]{10}$'` | SEC Central Index Key, zero-padded. It never changes, unlike ticker or name, so it is the stable identity. |
| ticker | varchar(10) | NOT NULL | | UNIQUE `companies_ticker_key`; CHECK `companies_ticker_format` `~ '^[A-Z0-9.-]{1,10}$'` | Exchange symbol used in the UI and URLs; upper case, `.`/`-` allowed for share classes (BRK-B). |
| name | text | NOT NULL | | CHECK `companies_name_not_blank` `btrim(name) <> ''` | Display name. |
| sector | text | NULL | | | yfinance sector (11 values). Used for GROUP BY and the same-sector comparisons. |
| industry | text | NULL | | | yfinance industry (finer than sector). |
| description | text | NULL | | | Business summary; the source text for the embedding. |
| description_embedding | **vector(384)** | NULL | | dimension enforced by the type; HNSW index `idx_companies_embedding` (vector_cosine_ops) | all-MiniLM-L6-v2 embedding, L2-normalised. NULL until `embed_descriptions.py` runs, or after the description changes. |
| last_updated | timestamptz | NOT NULL | now() | | Set by trigger `prices_after_insert` whenever a price row for this company is inserted. |

## 2. `prices`: daily OHLCV bars (25,300 rows, 2025-09-22 → 2026-10-23)
| Column | Type | Null | Constraints | Why |
|---|---|---|---|---|
| cik | varchar(10) | NOT NULL | **PK part**; FK `prices_cik_fkey` → companies(cik) **ON DELETE CASCADE** | Owner of the weak entity. |
| trade_date | date | NOT NULL | **PK part**; CHECK `prices_trading_day` `EXTRACT(isodow) < 6`; B-tree `idx_prices_trade_date` | Partial key. No weekend bars. The index serves "latest dates across all companies" (top_movers). |
| open, high, low, close | numeric(12,4) | NOT NULL | CHECK `prices_positive` (all > 0); `prices_high_is_max` `high >= GREATEST(open, close, low)`; `prices_low_is_min` `low <= LEAST(open, close)` | Exact decimals (no float rounding). 4 decimal places hold split-adjusted prices. |
| volume | bigint | NOT NULL | CHECK `prices_volume_nonneg` `>= 0` | Share volume can exceed 2³¹. |

## 3. `profiles`: application user record, 1:1 with Supabase `auth.users`
| Column | Type | Null | Default | Constraints | Why |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | | **PK**; FK `profiles_user_id_fkey` → auth.users(id) **ON DELETE CASCADE** | Same id Supabase Auth issues; deleting the auth user removes the profile. |
| display_name | text | NULL | | CHECK `profiles_display_name_len` `<= 60` | Set by the signup trigger from the email's local part. |
| role | text | NOT NULL | `'viewer'` | CHECK `profiles_role_check` `role IN ('analyst','viewer')` | Authorisation. Least privilege by default; validated by the database. |
| created_at | timestamptz | NOT NULL | now() | | |

No password or credential column exists. Supabase Auth stores password hashes in its own `auth` schema.

## 4. `watchlists`: M:N "profile WATCHES company"
| Column | Type | Null | Default | Constraints | Why |
|---|---|---|---|---|---|
| user_id | uuid | NOT NULL | | **PK part**; FK → profiles(user_id) ON DELETE CASCADE | |
| cik | varchar(10) | NOT NULL | | **PK part**; FK → companies(cik) ON DELETE CASCADE | |
| note | text | NULL | | CHECK `watchlists_note_len` `char_length(note) <= 500` | Attribute of the relationship. |
| created_at | timestamptz | NOT NULL | now() | | Attribute of the relationship. |
| updated_at | timestamptz | NULL | | CHECK `watchlists_updated_after_created` `updated_at >= created_at` | Added by **ALTER** (migration 001); set when the note is edited. |

The composite PK `watchlists_pkey (user_id, cik)` prevents watching the same company twice (the API returns 409). Trigger `watchlists_analyst_only` (BEFORE INSERT/UPDATE/DELETE) rejects writes for users whose role is not `analyst` (SQLSTATE 42501).

## 5. `activity_log`: audit trail
| Column | Type | Null | Default | Constraints | Why |
|---|---|---|---|---|---|
| log_id | integer | NOT NULL | nextval(sequence) (SERIAL) | **PK** | Surrogate key; the log has no natural key. Values can have gaps after rolled-back transactions (sequences are not transactional). |
| action | text | NOT NULL | | CHECK `activity_log_action_check` IN (`PRICE_INSERT`, `WATCHLIST_ADD`, `WATCHLIST_UPDATE`, `WATCHLIST_REMOVE`) | Closed set, so reports group cleanly. |
| cik | varchar(10) | NULL | | FK → companies(cik) **ON DELETE SET NULL** | Company the event is about; history survives deletion. |
| user_id | uuid | NULL | | FK → profiles(user_id) **ON DELETE SET NULL** | NULL for trigger rows (written by the seed pipeline); the real user for watchlist transactions. |
| logged_at | timestamptz | NOT NULL | now() | | |

---

## Other database objects
| Object | Kind | File | Purpose |
|---|---|---|---|
| `top_movers` | VIEW | `db/views.sql` | % change of every company between the two latest trading days |
| `idx_prices_trade_date` | B-tree index | `db/indexes.sql` | latest-dates scan for top_movers (Index Only Scan Backward) |
| `idx_companies_embedding` | HNSW index (m=16, ef_construction=64) | `db/indexes.sql` | approximate nearest-neighbour search with `<=>` |
| `prices_after_insert` → `trg_prices_after_insert()` | AFTER INSERT row trigger | `db/triggers.sql` | update `companies.last_updated` + insert `PRICE_INSERT` log row |
| `on_auth_user_created` → `handle_new_auth_user()` | AFTER INSERT row trigger on `auth.users`, SECURITY DEFINER, `search_path=''` | `db/auth_profiles.sql` | create a `viewer` profile for every signup |
| `watchlists_analyst_only` → `enforce_analyst_watchlist_writes()` | BEFORE INSERT/UPDATE/DELETE row trigger | `db/role_enforcement.sql` | database-level role enforcement |
| RLS enabled, no policies | security | `db/security.sql` | blocks Supabase's public REST API on all 5 tables |
| `idx_prices_cik`, `scratch_latest_close` | dropped | `db/migrations/002_drop_redundant_index.sql` | DROP demo (a redundant index and a scratch view) |
