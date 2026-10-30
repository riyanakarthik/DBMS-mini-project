-- The logged-in user's profile, looked up by the id Supabase Auth verified
-- from the session cookie (never by anything the client sends).
--   $1 = user_id (auth.users.id)
SELECT user_id, display_name, role
FROM profiles
WHERE user_id = $1;
