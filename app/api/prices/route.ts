import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { badRequest, errorResponse } from "@/lib/api";

// GET /api/prices?ticker=AAPL -> daily OHLCV, oldest first
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker");
  if (!ticker) return badRequest("ticker is required");
  try {
    return NextResponse.json(await query(loadSql("prices_for_company.sql"), [ticker.toUpperCase()]));
  } catch (err) {
    return errorResponse(err);
  }
}
