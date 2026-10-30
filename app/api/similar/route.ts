import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { badRequest, errorResponse } from "@/lib/api";

// GET /api/similar?ticker=JPM
// Semantic vs statistical similarity for one company:
//   semantic    = top-5 by description embedding (pgvector cosine)
//   statistical = top-5 by 1-year daily-return correlation (LAG + corr())
//   overlap / jaccard = |A ∩ B| and |A ∩ B| / |A ∪ B| of the two ticker sets
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authorize(); // any logged-in user (viewer or analyst) may read
  if ("response" in auth) return auth.response;
  const ticker = new URL(req.url).searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return badRequest("ticker is required");
  try {
    const [company] = await query(loadSql("company_by_ticker.sql"), [ticker]);
    if (!company) return NextResponse.json({ error: `Unknown ticker ${ticker}` }, { status: 404 });

    // The two queries are independent, so run them in parallel.
    const [semantic, statistical] = await Promise.all([
      query<{ ticker: string }>(loadSql("similar_companies.sql"), [ticker]),
      query<{ ticker: string }>(loadSql("correlated_companies.sql"), [ticker]),
    ]);

    const a = new Set(semantic.map((r) => r.ticker));
    const b = new Set(statistical.map((r) => r.ticker));
    const overlap = [...a].filter((t) => b.has(t));
    const unionSize = new Set([...a, ...b]).size;

    return NextResponse.json({
      company,
      semantic,
      statistical,
      overlap,
      jaccard: unionSize ? overlap.length / unionSize : 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
