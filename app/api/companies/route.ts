import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { errorResponse } from "@/lib/api";

// GET /api/companies?q=bank&sector=Financial%20Services  (both optional)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authorize(); // any logged-in user (viewer or analyst) may read
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || null;
  const sector = url.searchParams.get("sector") || null;
  try {
    return NextResponse.json(await query(loadSql("companies_search.sql"), [q, sector]));
  } catch (err) {
    return errorResponse(err);
  }
}
