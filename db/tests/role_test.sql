-- =====================================================================
-- Role tests (database level). Leaves NO trace: everything runs inside
-- one transaction that is rolled back at the end.
--   psql "$DATABASE_URL" -f db/tests/role_test.sql
--
-- ON_ERROR_ROLLBACK: psql wraps each statement in a savepoint, so an
-- expected failure undoes only that statement and the test continues.
-- =====================================================================
\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK on

BEGIN;

\echo '--- 1. Signup trigger: inserting a new auth user creates a viewer profile'
INSERT INTO auth.users (id, email, aud, role)
VALUES ('00000000-0000-4000-8000-000000000001', 'role-test@equivector.local', 'authenticated', 'authenticated');
SELECT user_id, display_name, role FROM profiles
WHERE user_id = '00000000-0000-4000-8000-000000000001';           -- expect: role-test | viewer

\echo '--- 2. Invalid role on UPDATE (expect: violates check constraint "profiles_role_check")'
UPDATE profiles SET role = 'admin'
WHERE user_id = '00000000-0000-4000-8000-000000000001';

\echo '--- 3. Invalid role on INSERT (expect: violates check constraint "profiles_role_check")'
INSERT INTO auth.users (id, email, aud, role)
VALUES ('00000000-0000-4000-8000-000000000002', 'role-test-2@equivector.local', 'authenticated', 'authenticated');
DELETE FROM profiles WHERE user_id = '00000000-0000-4000-8000-000000000002';   -- remove the auto profile
INSERT INTO profiles (user_id, display_name, role)
VALUES ('00000000-0000-4000-8000-000000000002', 'bad role', 'superuser');

\echo '--- 4. NULL role (expect: null value in column "role" violates not-null constraint)'
INSERT INTO profiles (user_id, display_name, role)
VALUES ('00000000-0000-4000-8000-000000000002', 'null role', NULL);

\echo '--- 5. A viewer cannot get a watchlist row (expect: only analysts can modify watchlists)'
INSERT INTO watchlists (user_id, cik)
VALUES ('00000000-0000-4000-8000-000000000001', (SELECT cik FROM companies WHERE ticker = 'AAPL'));

\echo '--- 6. After promotion to analyst, the same insert succeeds (expect: INSERT 0 1)'
UPDATE profiles SET role = 'analyst'
WHERE user_id = '00000000-0000-4000-8000-000000000001';
INSERT INTO watchlists (user_id, cik)
VALUES ('00000000-0000-4000-8000-000000000001', (SELECT cik FROM companies WHERE ticker = 'AAPL'));

ROLLBACK;

\echo '--- 7. After ROLLBACK nothing remains (expect: 0)'
SELECT count(*) AS leftover_test_users
FROM auth.users WHERE email LIKE 'role-test%@equivector.local';
