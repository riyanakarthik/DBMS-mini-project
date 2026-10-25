-- =====================================================================
-- TODO(Phase 4): DELETE THIS FILE once Supabase Auth signup is built.
--
-- Temporary demo user so the watchlist can be shown before auth exists.
-- Creates a password-less row in Supabase's auth.users (it cannot log in)
-- plus its profiles row with role 'analyst', and prints the UUID to put
-- in .env.local as DEMO_USER_ID.
--   psql "$DATABASE_URL" -f db/demo/create_demo_user.sql
-- Safe to re-run: reuses the existing demo user if present.
-- =====================================================================
INSERT INTO auth.users (id, email, aud, role)
SELECT gen_random_uuid(), 'demo-analyst@equivector.local', 'authenticated', 'authenticated'
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo-analyst@equivector.local');

INSERT INTO profiles (user_id, display_name, role)
SELECT id, 'Demo Analyst', 'analyst'
FROM auth.users
WHERE email = 'demo-analyst@equivector.local'
ON CONFLICT (user_id) DO NOTHING;

SELECT p.user_id AS demo_user_id, p.display_name, p.role
FROM profiles p
JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'demo-analyst@equivector.local';
