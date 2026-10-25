-- =====================================================================
-- Migration 001: ALTER TABLE, evolve a live table without recreating it.
--   psql "$DATABASE_URL" -f db/migrations/001_watchlists_add_updated_at.sql
--
-- Why: Phase 3 lets an analyst edit a watchlist note (an UPDATE). We want
-- to record WHEN the note was last edited, separately from created_at.
-- Safe to re-run (IF NOT EXISTS / DROP ... IF EXISTS).
-- =====================================================================

BEGIN;

-- 1. ADD COLUMN: nullable, because existing rows have never been edited.
ALTER TABLE watchlists
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 2. ADD CONSTRAINT: an edit cannot happen before the row was created.
--    (NULL passes a CHECK, so un-edited rows are fine.)
ALTER TABLE watchlists
    DROP CONSTRAINT IF EXISTS watchlists_updated_after_created;
ALTER TABLE watchlists
    ADD CONSTRAINT watchlists_updated_after_created
    CHECK (updated_at >= created_at);

COMMIT;
