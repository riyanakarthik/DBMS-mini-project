-- Step 2 of every watchlist TRANSACTION: audit row, written by the SAME
-- transaction as the change it records, so both commit or neither does.
--   $1 = action ('WATCHLIST_ADD' | 'WATCHLIST_UPDATE' | 'WATCHLIST_REMOVE'), $2 = cik, $3 = user_id
INSERT INTO activity_log (action, cik, user_id)
VALUES ($1, $2, $3)
RETURNING log_id;
