-- Step 1 of the "add to watchlist" TRANSACTION (POST /api/watchlist).
--   $1 = user_id, $2 = cik, $3 = note
-- Duplicate (user, company) -> violates watchlists_pkey -> whole transaction rolls back.
INSERT INTO watchlists (user_id, cik, note)
VALUES ($1, $2, $3)
RETURNING user_id, cik, note, created_at;
