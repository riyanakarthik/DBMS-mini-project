-- =====================================================================
-- Auth -> profiles: every new Supabase Auth user automatically gets a
-- row in public.profiles with the default role 'viewer'.
--   psql "$DATABASE_URL" -f db/auth_profiles.sql
-- Safe to re-run (CREATE OR REPLACE, ON CONFLICT DO NOTHING).
-- =====================================================================

-- Trigger function. Runs once for every row inserted into auth.users
-- (i.e. every signup). NEW is the new auth user.
--
-- SECURITY DEFINER: the function runs with the privileges of its OWNER
-- (postgres), not of the caller. Signups are inserted by Supabase's
-- internal auth role, which has no rights on public.profiles; this lets
-- the insert succeed anyway.
-- SET search_path = '': because the function runs with elevated rights,
-- it must not resolve names through a search_path someone else could
-- influence (a malicious schema could shadow "profiles"). With an empty
-- search_path every name must be schema-qualified (public.profiles), so
-- the function can only ever touch the intended table.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name, role)
    VALUES (
        NEW.id,
        left(split_part(NEW.email, '@', 1), 60),  -- "analyst@gmail.com" -> "analyst" (<= 60 chars, see CHECK)
        'viewer'                                  -- least privilege by default; promote with UPDATE
    )
    ON CONFLICT (user_id) DO NOTHING;             -- never fail a signup because a profile already exists
    RETURN NEW;                                   -- ignored for AFTER triggers
END;
$$;

-- AFTER INSERT: the auth.users row exists by the time we insert the
-- profile, so the profiles.user_id -> auth.users(id) foreign key is satisfied.
CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill: users who signed up BEFORE this trigger existed have no
-- profile yet. Give each of them a 'viewer' profile now.
INSERT INTO public.profiles (user_id, display_name, role)
SELECT u.id,
       left(split_part(u.email, '@', 1), 60),
       'viewer'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);
