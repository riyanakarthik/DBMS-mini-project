import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { errorResponse } from "@/lib/api";

// GET /api/companies?q=bank&sector=Financial%20Services  (both optional)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() || null;
  const sector = url.searchParams.get("sector") || null;
  try {
    return NextResponse.json(await query(loadSql("companies_search.sql"), [q, sector]));
  } catch (err) {
    return errorResponse(err);
  }
}
