-- DELETE: remove a company from the user's watchlist (DELETE /api/watchlist).
--   $1 = user_id, $2 = cik
DELETE FROM watchlists
WHERE user_id = $1
  AND cik = $2
RETURNING cik;
