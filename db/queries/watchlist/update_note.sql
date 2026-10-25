-- UPDATE: edit a watchlist note (PATCH /api/watchlist).
--   $1 = user_id, $2 = cik, $3 = new note
-- updated_at was added by db/migrations/001 (ALTER TABLE); its CHECK
-- constraint guarantees updated_at >= created_at.
UPDATE watchlists
SET note = $3,
    updated_at = now()
WHERE user_id = $1
  AND cik = $2
RETURNING cik, note, updated_at;
