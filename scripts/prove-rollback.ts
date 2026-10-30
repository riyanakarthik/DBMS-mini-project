// Proves the watchlist transaction is atomic: if anything fails before COMMIT,
// NEITHER the watchlist row NOR its activity_log row persists.
//   npx tsx scripts/prove-rollback.ts [analyst-email]   (default analyst@gmail.com)
// Uses the app's own withTransaction() and insert statements (lib/), not copies.
import type { PoolClient } from "pg";

process.loadEnvFile(".env.local");

async function main() {
  const { getPool, withTransaction } = await import("../lib/db");
  const { loadSql } = await import("../lib/sql");
  const { insertWatchlistWithLog, cikForTicker } = await import("../lib/watchlist");
  const pool = getPool();
  // Run as a real analyst (only analysts may write watchlists: db/role_enforcement.sql).
  const email = process.argv[2] ?? "analyst@gmail.com";
  const { rows: found } = await pool.query(
    `SELECT u.id FROM auth.users u JOIN profiles p ON p.user_id = u.id
     WHERE u.email = $1 AND p.role = 'analyst'`, [email]);
  if (!found[0]) throw new Error(`${email} is not an analyst`);
  const user: string = found[0].id;
  console.log(`running as ${email} (${user})`);
  const ticker = "KO";

  const counts = async () => {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM watchlists WHERE user_id = $1) AS watchlist_rows,
              (SELECT count(*) FROM activity_log)                  AS activity_log_rows,
              EXISTS (SELECT 1 FROM watchlists w JOIN companies c USING (cik)
                      WHERE w.user_id = $1 AND c.ticker = $2)      AS ko_on_watchlist`,
      [user, ticker],
    );
    return rows[0];
  };

  const before = await counts();
  if (before.ko_on_watchlist) throw new Error(`${ticker} is already on this user's watchlist; remove it first`);
  console.log("before:", before);

  // Scenario 1: both INSERTs succeed, then the app fails before COMMIT.
  try {
    await withTransaction(async (client: PoolClient) => {
      await insertWatchlistWithLog(client, user, ticker, "rollback test");
      const { rows } = await client.query(
        "SELECT count(*) AS n FROM watchlists WHERE user_id = $1", [user]);
      console.log(`  scenario 1: inside the transaction the new row IS visible (watchlist rows = ${rows[0].n})`);
      throw new Error("forced failure after both INSERTs, before COMMIT");
    });
  } catch (e) {
    console.log("  scenario 1 failed as intended:", (e as Error).message);
  }
  const after1 = await counts();
  console.log("after scenario 1:", after1);

  // Scenario 2: the watchlist INSERT succeeds, then the DATABASE rejects the
  // audit row (invalid action violates activity_log_action_check).
  try {
    await withTransaction(async (client: PoolClient) => {
      const cik = await cikForTicker(client, ticker);
      await client.query(loadSql("watchlist/insert.sql"), [user, cik, "rollback test 2"]);
      await client.query(loadSql("watchlist/log_action.sql"), ["NOT_A_REAL_ACTION", cik, user]);
    });
  } catch (e) {
    const err = e as { message: string; constraint?: string };
    console.log(`  scenario 2 failed as intended: ${err.message} [constraint: ${err.constraint}]`);
  }
  const after2 = await counts();
  console.log("after scenario 2:", after2);

  const same = (a: typeof before) =>
    a.watchlist_rows === before.watchlist_rows &&
    a.activity_log_rows === before.activity_log_rows &&
    !a.ko_on_watchlist;
  const pass = same(after1) && same(after2);
  console.log(pass ? "PASS: nothing persisted from either failed transaction" : "FAIL: partial data persisted");
  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
