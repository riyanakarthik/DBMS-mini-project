import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { errorResponse } from "@/lib/api";

// GET /api/top-movers -> every company's % change between the two latest days
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await query(loadSql("top_movers.sql")));
  } catch (err) {
    return errorResponse(err);
  }
}
