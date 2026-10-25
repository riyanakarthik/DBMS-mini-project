-- =====================================================================
-- EquiVector schema: 5 tables (companies, prices, profiles, watchlists,
-- activity_log). Run once against an EMPTY database, in this order:
--   1. db/schema.sql      (this file)
--   2. db/indexes.sql     (Phase 2)
--   3. db/views.sql       (Phase 2)
--   4. db/triggers.sql    (Phase 2)
--
-- Supabase: run in the SQL editor, or with
--   psql "$DATABASE_URL" -f db/schema.sql
-- Local Postgres (no Supabase): run db/local/auth_stub.sql first, because
-- profiles references auth.users, which only exists on Supabase.
--
-- Validation is done HERE, in the database (NOT NULL, CHECK, FK, UNIQUE),
-- not only in the app. Every constraint is named so that error messages
-- in the app and in the test log say which rule was broken.
-- =====================================================================

-- pgvector adds the VECTOR(n) column type, the <=> (cosine distance)
-- operator and the HNSW index type.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- 1. companies: one row per listed company.
--    Structured identity/classification columns are plain SQL; the free
--    text description is also stored as a 384-dim embedding (pgvector).
-- ---------------------------------------------------------------------
CREATE TABLE companies (
    cik                   VARCHAR(10)  PRIMARY KEY,   -- SEC Central Index Key, zero-padded
    ticker                VARCHAR(10)  NOT NULL,
    name                  TEXT         NOT NULL,
    sector                TEXT,
    industry              TEXT,
    description           TEXT,                       -- source text for the embedding
    description_embedding VECTOR(384),                -- all-MiniLM-L6-v2, L2-normalised
    last_updated          TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT companies_ticker_key   UNIQUE (ticker),
    -- CIKs are always 10 digits once zero-padded (e.g. 0000320193 = Apple)
    CONSTRAINT companies_cik_format   CHECK (cik ~ '^[0-9]{10}$'),
    -- upper-case tickers; '.' and '-' allowed for share classes (BRK-B)
    CONSTRAINT companies_ticker_format CHECK (ticker ~ '^[A-Z0-9.-]{1,10}$'),
    CONSTRAINT companies_name_not_blank CHECK (btrim(name) <> '')
);

-- ---------------------------------------------------------------------
-- 2. prices: daily OHLCV bars. Weak entity of companies: a bar is
--    identified by (cik, trade_date), so the PK is composite and there
--    is no surrogate id.
-- ---------------------------------------------------------------------
CREATE TABLE prices (
    cik         VARCHAR(10)    NOT NULL,
    trade_date  DATE           NOT NULL,
    open        NUMERIC(12,4)  NOT NULL,
    high        NUMERIC(12,4)  NOT NULL,
    low         NUMERIC(12,4)  NOT NULL,
    close       NUMERIC(12,4)  NOT NULL,
    volume      BIGINT         NOT NULL,

    CONSTRAINT prices_pkey PRIMARY KEY (cik, trade_date),
    -- deleting a company deletes its price history (identifying relationship)
    CONSTRAINT prices_cik_fkey FOREIGN KEY (cik)
        REFERENCES companies (cik) ON DELETE CASCADE,
    CONSTRAINT prices_positive     CHECK (open > 0 AND high > 0 AND low > 0 AND close > 0),
    CONSTRAINT prices_volume_nonneg CHECK (volume >= 0),
    -- a bar's high must be the highest price of the day, its low the lowest
    CONSTRAINT prices_high_is_max  CHECK (high >= GREATEST(open, close, low)),
    CONSTRAINT prices_low_is_min   CHECK (low  <= LEAST(open, close)),
    -- no weekend bars (US exchanges are closed Sat/Sun); ISODOW 6 = Sat, 7 = Sun
    CONSTRAINT prices_trading_day  CHECK (EXTRACT(ISODOW FROM trade_date) < 6)
);

-- ---------------------------------------------------------------------
-- 3. profiles: app-level user record, 1:1 with Supabase's auth.users.
--    Supabase Auth stores the password hash; we store NO credentials.
--    The role lives here (not in auth metadata) so the database itself
--    can validate it with a CHECK constraint.
-- ---------------------------------------------------------------------
CREATE TABLE profiles (
    user_id       UUID         PRIMARY KEY,
    display_name  TEXT,
    role          TEXT         NOT NULL DEFAULT 'viewer',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT profiles_role_check CHECK (role IN ('analyst', 'viewer')),
    CONSTRAINT profiles_display_name_len CHECK (char_length(display_name) <= 60)
);

-- ---------------------------------------------------------------------
-- 4. watchlists: the M:N WATCHES relationship between profiles and
--    companies. note and created_at are attributes of the relationship.
--    The composite PK means a user cannot watch the same company twice.
-- ---------------------------------------------------------------------
CREATE TABLE watchlists (
    user_id     UUID         NOT NULL,
    cik         VARCHAR(10)  NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT watchlists_pkey PRIMARY KEY (user_id, cik),
    CONSTRAINT watchlists_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES profiles (user_id) ON DELETE CASCADE,
    CONSTRAINT watchlists_cik_fkey FOREIGN KEY (cik)
        REFERENCES companies (cik) ON DELETE CASCADE,
    CONSTRAINT watchlists_note_len CHECK (char_length(note) <= 500)
);

-- ---------------------------------------------------------------------
-- 5. activity_log: audit trail. Written by the AFTER INSERT ON prices
--    trigger (user_id NULL) and by the watchlist transaction (user_id set).
--    FKs use ON DELETE SET NULL so history survives deleted users/companies.
-- ---------------------------------------------------------------------
CREATE TABLE activity_log (
    log_id     SERIAL       PRIMARY KEY,
    action     TEXT         NOT NULL,
    cik        VARCHAR(10),
    user_id    UUID,
    logged_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT activity_log_cik_fkey FOREIGN KEY (cik)
        REFERENCES companies (cik) ON DELETE SET NULL,
    CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES profiles (user_id) ON DELETE SET NULL,
    -- closed set of actions, so the "summary per action type" report is clean
    CONSTRAINT activity_log_action_check CHECK (action IN (
        'PRICE_INSERT',       -- prices trigger
        'WATCHLIST_ADD',      -- watchlist transaction
        'WATCHLIST_UPDATE',   -- note edited
        'WATCHLIST_REMOVE'    -- entry deleted
    ))
);
