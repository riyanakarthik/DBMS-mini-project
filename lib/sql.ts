import { readFileSync } from "node:fs";
import path from "node:path";

// Every SQL statement the app runs lives in db/queries/*.sql, so the file
// shown in the report/viva is exactly what executes. Paths passed here are
// fixed strings in our code, never user input.
const cache = new Map<string, string>();

export function loadSql(relativePath: string): string {
  let text = cache.get(relativePath);
  if (!text) {
    text = readFileSync(path.join(process.cwd(), "db", "queries", relativePath), "utf8");
    cache.set(relativePath, text);
  }
  return text;
}
