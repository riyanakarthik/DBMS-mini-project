import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/health: confirms the app can reach Postgres and that the
// 5 tables and the pgvector extension exist.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tables = await query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('companies', 'prices', 'profiles', 'watchlists', 'activity_log')
        ORDER BY table_name`
    );
    const ext = await query<{ extversion: string }>(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );
    return NextResponse.json({
      ok: true,
      tables: tables.map((t) => t.table_name),
      pgvector: ext[0]?.extversion ?? null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
