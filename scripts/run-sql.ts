// Run one db/queries/*.sql file exactly as the API does, and print the rows.
//   npx tsx scripts/run-sql.ts db/queries/similar_companies.sql JPM
// Extra arguments become $1, $2, ... (same parameter binding as the API).
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");

async function main() {
  const { getPool } = await import("../lib/db");
  const [file, ...params] = process.argv.slice(2);
  if (!file) throw new Error("usage: tsx scripts/run-sql.ts <file.sql> [params...]");
  const started = Date.now();
  const { rows } = await getPool().query(readFileSync(file, "utf8"), params);
  console.table(rows);
  console.log(`${rows.length} rows in ${Date.now() - started} ms`);
  await getPool().end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
