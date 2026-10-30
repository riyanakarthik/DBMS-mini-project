// End-to-end role test against the RUNNING app (npm run dev / npm start).
//   npx tsx scripts/test-roles.ts            (app at http://localhost:3000)
// Logs in as real Supabase Auth users exactly like the browser does (session
// cookies from @supabase/ssr), then checks the HTTP status of reads and
// writes for: anonymous (expect 401), viewer (reads 200, writes 403),
// analyst (reads 200, writes 200/201).
// Reads TEST_ANALYST_EMAIL/PASSWORD and TEST_VIEWER_EMAIL/PASSWORD from .env.local;
// a section whose login is missing is reported as SKIPPED, not silently passed.
import { createServerClient } from "@supabase/ssr";

process.loadEnvFile(".env.local");
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set in .env.local`);
  return v;
};

// Sign in and return the Cookie header a browser would send afterwards.
async function login(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

type Result = { who: string; request: string; expected: string; actual: number; result: string };
const results: Result[] = [];

async function check(
  who: string,
  cookie: string | null,
  method: string,
  path: string,
  expected: number[],
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  results.push({
    who,
    request: `${method} ${path}${body ? " " + JSON.stringify(body) : ""}`.slice(0, 90),
    expected: expected.join("/"),
    actual: res.status,
    result: expected.includes(res.status) ? "PASS" : "FAIL",
  });
  return json;
}

async function loginIfConfigured(prefix: "TEST_VIEWER" | "TEST_ANALYST"): Promise<string | null> {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    console.log(`SKIPPED ${prefix} tests: ${prefix}_EMAIL / ${prefix}_PASSWORD not set in .env.local`);
    return null;
  }
  return login(email, password);
}

async function main() {
  const viewer = await loginIfConfigured("TEST_VIEWER");
  const analyst = await loginIfConfigured("TEST_ANALYST");

  // --- anonymous: no cookie at all
  await check("anonymous", null, "GET", "/api/top-movers", [401]);
  await check("anonymous", null, "GET", "/api/watchlist", [401]);
  await check("anonymous", null, "POST", "/api/watchlist", [401], { ticker: "MSFT" });

  // --- viewer: may read, may not write
  let vMe: { email?: string; role?: string } | null = null;
  if (viewer) {
  vMe = await check("viewer", viewer, "GET", "/api/me", [200]);
  await check("viewer", viewer, "GET", "/api/reports/sector-summary", [200]);
  await check("viewer", viewer, "GET", "/api/similar?ticker=JPM", [200]);
  await check("viewer", viewer, "GET", "/api/watchlist", [200]);
  await check("viewer", viewer, "POST", "/api/watchlist", [403], { ticker: "MSFT" });
  // forged role in body + header: ignored, the role comes from profiles
  await check("viewer (forged role)", viewer, "POST", "/api/watchlist", [403], { ticker: "MSFT", role: "analyst" }, {
    "x-user-role": "analyst",
  });
  await check("viewer", viewer, "PATCH", "/api/watchlist", [403], { cik: "0000789019", note: "x" });
  await check("viewer", viewer, "DELETE", "/api/watchlist?cik=0000789019", [403]);
  // input validation on reads
  await check("viewer", viewer, "GET", "/api/reports/sector-having?min_companies=abc", [400]);
  await check("viewer", viewer, "GET", "/api/similar?ticker=ZZZZ", [404]);
  }

  // --- analyst: may read and write
  let aMe: { email?: string; role?: string } | null = null;
  if (analyst) {
  aMe = await check("analyst", analyst, "GET", "/api/me", [200]);
  const [msft] = await check("analyst", analyst, "GET", "/api/companies?q=MSFT", [200]);
  await check("analyst (cleanup)", analyst, "DELETE", `/api/watchlist?cik=${msft.cik}`, [200, 404]);
  await check("analyst", analyst, "POST", "/api/watchlist", [201], { ticker: "MSFT", note: "role test: added by analyst" });
  await check("analyst", analyst, "POST", "/api/watchlist", [409], { ticker: "MSFT" }); // duplicate -> DB PK
  await check("analyst", analyst, "PATCH", "/api/watchlist", [200], { cik: msft.cik, note: "role test: note edited" });
  await check("analyst", analyst, "PATCH", "/api/watchlist", [400], { cik: msft.cik, note: "x".repeat(501) }); // DB CHECK note <= 500
  }

  console.log(`viewer = ${vMe?.email ?? "skipped"} (${vMe?.role ?? "-"}), analyst = ${aMe?.email ?? "skipped"} (${aMe?.role ?? "-"})`);
  console.table(results);
  const failed = results.filter((r) => r.result === "FAIL").length;
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASSED`);

  // The audit rows written by the analyst's transactions carry the real user id.
  const { getPool } = await import("../lib/db");
  const { rows } = await getPool().query(
    `SELECT l.log_id, l.action, c.ticker, l.user_id, u.email, l.logged_at
     FROM activity_log l
     JOIN companies c ON c.cik = l.cik
     LEFT JOIN auth.users u ON u.id = l.user_id
     WHERE l.action LIKE 'WATCHLIST_%'
     ORDER BY l.log_id DESC
     LIMIT 4`,
  );
  console.log("latest watchlist activity_log rows:");
  console.table(rows);
  await getPool().end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
