import { Pool, type QueryResultRow } from "pg";

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
