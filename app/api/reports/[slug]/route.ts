import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadSql } from "@/lib/sql";
import { findReport } from "@/lib/reports";
import { badRequest, errorResponse } from "@/lib/api";

// GET /api/reports/<slug>[?param=value...]
// Runs the report's SQL file from db/queries/reports/ with numeric params
// bound as $1, $2, ... in the order the report declares them.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = findReport(slug);
  if (!report) return NextResponse.json({ error: `Unknown report ${slug}` }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const values: number[] = [];
  for (const p of report.params ?? []) {
    const raw = search.get(p.name);
    const value = raw === null || raw === "" ? p.default : Number(raw);
    if (!Number.isFinite(value)) return badRequest(`${p.name} must be a number`);
    values.push(value);
  }

  try {
    const started = Date.now();
    const rows = await query(loadSql(report.file), values);
    return NextResponse.json({ slug, file: `db/queries/${report.file}`, params: values, rows, ms: Date.now() - started });
  } catch (err) {
    return errorResponse(err);
  }
}
