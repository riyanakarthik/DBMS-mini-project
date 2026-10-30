-- =====================================================================
-- Database-level role enforcement: only ANALYSTS may have watchlist
-- rows written for them. Second line of defence behind the API's 403.
--   psql "$DATABASE_URL" -f db/role_enforcement.sql
--
-- Why a trigger and not a CHECK: a CHECK constraint can only look at the
-- row being written, but the role lives in another table (profiles).
-- A BEFORE trigger can query profiles and reject the write.
-- (profiles.role itself stays validated by profiles_role_check.)
--
-- Note: the app connects as one database user, so the database checks the
-- role of the user the row BELONGS to (watchlists.user_id), which the API
-- always sets to the logged-in user's id.
-- =====================================================================
CREATE OR REPLACE FUNCTION enforce_analyst_watchlist_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        -- the row's owner must exist as an analyst
        IF NOT EXISTS (SELECT 1 FROM profiles
                       WHERE user_id = NEW.user_id AND role = 'analyst') THEN
            RAISE EXCEPTION 'only analysts can modify watchlists (user %)', NEW.user_id
                USING ERRCODE = '42501';            -- insufficient_privilege -> API returns 403
        END IF;
        RETURN NEW;
    END IF;

    -- DELETE: block a viewer. If the profile no longer exists (the account is
    -- being deleted and the delete is CASCADING here), allow it.
    IF EXISTS (SELECT 1 FROM profiles
               WHERE user_id = OLD.user_id AND role <> 'analyst') THEN
        RAISE EXCEPTION 'only analysts can modify watchlists (user %)', OLD.user_id
            USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;

-- BEFORE: runs before the row is written, so RAISE stops the write and
-- (inside the app's transaction) rolls back the activity_log insert too.
CREATE OR REPLACE TRIGGER watchlists_analyst_only
BEFORE INSERT OR UPDATE OR DELETE ON watchlists
FOR EACH ROW
EXECUTE FUNCTION enforce_analyst_watchlist_writes();
