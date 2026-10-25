import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Type parsing (OIDs are Postgres type ids):
// DATE (1082): keep as 'YYYY-MM-DD'. The default turns it into a JS Date at
//   *local* midnight, which shifts to the previous day when sent as UTC JSON.
types.setTypeParser(1082, (v) => v);
// NUMERIC (1700) and BIGINT/count(*) (20): pg returns strings to avoid
// precision loss; our values (prices, %s, counts) fit safely in a JS number.
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

// One shared connection pool for all API routes. Credentials come only from
// env vars (.env.local); nothing is hard-coded.
// DATABASE_URL must be a direct or session-mode connection string so that
// BEGIN/COMMIT/ROLLBACK run on one session (see .env.local.example).

declare global {
  // Reuse the pool across hot reloads in `next dev`.
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.local.example to .env.local.");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase requires TLS. Its server certificate is not in Node's default
    // CA bundle, so we encrypt without verifying the chain.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

export function getPool(): Pool {
  if (!global._pgPool) global._pgPool = createPool();
  return global._pgPool;
}

// Run one parameterised query ($1, $2, ...). Always pass user input as
// params, never by string concatenation, to prevent SQL injection.
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

// Run `work` inside one database transaction on ONE pooled connection.
// All statements see each other's effects and commit together; if any of
// them throws (e.g. a constraint violation), everything is rolled back.
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect(); // a transaction must stay on one connection
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK"); // undo every statement since BEGIN
    throw err;
  } finally {
    client.release(); // return the connection to the pool either way
  }
}
