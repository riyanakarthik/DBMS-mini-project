-- =====================================================================
-- Change a user's role (admin task, run from psql, never from the app).
--   psql "$DATABASE_URL" -v email=analyst@gmail.com -v role=analyst -f db/admin/set_role.sql
-- profiles_role_check rejects anything other than 'analyst' / 'viewer'.
-- =====================================================================
\set ON_ERROR_STOP on

UPDATE profiles
SET role = :'role'
WHERE user_id = (SELECT id FROM auth.users WHERE email = :'email')
RETURNING user_id, display_name, role;
