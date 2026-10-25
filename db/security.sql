-- =====================================================================
-- Lock the tables away from Supabase's auto-generated REST API.
-- Run after db/schema.sql:  psql "$DATABASE_URL" -f db/security.sql
--
-- Why: Supabase publishes every table in the `public` schema through its
-- REST API (PostgREST) to the `anon` and `authenticated` roles. Their key
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY) is visible in the browser, so without
-- this anyone could read or write our tables directly, bypassing the API
-- routes and their role checks.
--
-- Enabling Row Level Security with NO policies denies every row to those
-- roles. Our app connects through `pg` as the table owner (postgres), and
-- owners are not subject to RLS, so the app's own queries are unaffected.
-- All data access therefore goes through the Next.js API layer.
-- =====================================================================

ALTER TABLE companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
