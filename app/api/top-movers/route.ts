import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { errorResponse } from "@/lib/api";

// GET /api/top-movers -> every company's % change between the two latest days
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authorize(); // any logged-in user (viewer or analyst) may read
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await query(loadSql("top_movers.sql")));
  } catch (err) {
    return errorResponse(err);
  }
}
