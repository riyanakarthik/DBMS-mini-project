import type { PoolClient } from "pg";
import { query, withTransaction } from "./db";
import { loadSql } from "./sql";

export class NotFoundError extends Error {}

export async function cikForTicker(client: PoolClient, ticker: string): Promise<string> {
  const { rows } = await client.query<{ cik: string }>("SELECT cik FROM companies WHERE ticker = $1", [ticker]);
  if (!rows[0]) throw new NotFoundError(`Unknown ticker ${ticker}`);
  return rows[0].cik;
}

export function listWatchlist(userId: string) {
  return query(loadSql("watchlist/list.sql"), [userId]);
}

// The two statements of "add to watchlist". Must run inside a transaction
// (see addToWatchlist); kept separate so scripts/prove-rollback.ts can run
// exactly these statements and then force a failure before COMMIT.
export async function insertWatchlistWithLog(client: PoolClient, userId: string, ticker: string, note: string | null) {
  const cik = await cikForTicker(client, ticker);
  const { rows } = await client.query(loadSql("watchlist/insert.sql"), [userId, cik, note]);
  await client.query(loadSql("watchlist/log_action.sql"), ["WATCHLIST_ADD", cik, userId]);
  return rows[0];
}

// BEGIN -> INSERT watchlists -> INSERT activity_log -> COMMIT (or ROLLBACK).
export function addToWatchlist(userId: string, ticker: string, note: string | null) {
  return withTransaction((client) => insertWatchlistWithLog(client, userId, ticker, note));
}

// BEGIN -> UPDATE watchlists -> INSERT activity_log -> COMMIT (or ROLLBACK).
export function updateWatchlistNote(userId: string, cik: string, note: string | null) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(loadSql("watchlist/update_note.sql"), [userId, cik, note]);
    if (!rows[0]) throw new NotFoundError("Not on your watchlist");
    await client.query(loadSql("watchlist/log_action.sql"), ["WATCHLIST_UPDATE", cik, userId]);
    return rows[0];
  });
}

// BEGIN -> DELETE watchlists -> INSERT activity_log -> COMMIT (or ROLLBACK).
export function removeFromWatchlist(userId: string, cik: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(loadSql("watchlist/delete.sql"), [userId, cik]);
    if (!rows[0]) throw new NotFoundError("Not on your watchlist");
    await client.query(loadSql("watchlist/log_action.sql"), ["WATCHLIST_REMOVE", cik, userId]);
    return rows[0];
  });
}
