"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { GroupedBarChart, SimpleBarChart } from "@/components/charts";
import { REPORTS, type ReportDef } from "@/lib/reports";
import { useFetch } from "@/lib/use-fetch";

type Row = Record<string, unknown>;
type ReportResult = { file: string; rows: Row[]; ms: number };

export default function ReportsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each report runs one SQL file from <code>db/queries/reports/</code> through <code>/api/reports/&lt;name&gt;</code>.
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm">
          {REPORTS.map((r) => (
            <a key={r.slug} href={`#${r.slug}`} className="rounded border px-2 py-1 hover:bg-muted">
              {r.title}
            </a>
          ))}
        </nav>
      </div>
      {REPORTS.map((r) => (
        <ReportCard key={r.slug} report={r} />
      ))}
    </main>
  );
}

function ReportCard({ report }: { report: ReportDef }) {
  const defaults = Object.fromEntries((report.params ?? []).map((p) => [p.name, String(p.default)]));
  const [form, setForm] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const { data, error, loading } = useFetch<ReportResult>(
    `/api/reports/${report.slug}?${new URLSearchParams(applied)}`,
  );
  const rows = data?.rows ?? [];
  const chart = report.chart;
  const chartRows = chart?.kind === "bar" && chart.limit ? rows.slice(0, chart.limit) : rows;

  return (
    <Card id={report.slug} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{report.title}</CardTitle>
        <CardDescription>{report.question}</CardDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <Badge variant="secondary">{report.concepts}</Badge>
          <code>db/queries/{report.file}</code>
          {data && <span>· {rows.length} rows · {data.ms} ms</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.params && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(form);
            }}
          >
            {report.params.map((p) => (
              <label key={p.name} className="text-sm">
                <span className="mb-1 block text-muted-foreground">{p.label}</span>
                <Input
                  type="number"
                  className="w-40"
                  value={form[p.name]}
                  onChange={(e) => setForm({ ...form, [p.name]: e.target.value })}
                />
              </label>
            ))}
            <Button type="submit" size="sm">Run</Button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && !data && <p className="text-sm text-muted-foreground">Running query…</p>}
        {report.slug === "semantic-vs-statistical" && rows.length > 0 && <SemanticFindings rows={rows} />}
        {report.slug === "sector-embedding-distance" && rows.length > 0 && <VectorFindings rows={rows} />}
        {chart?.kind === "bar" && rows.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">{chart.label}</p>
            <SimpleBarChart rows={chartRows} x={chart.x} y={chart.y} diverging={chart.diverging} />
          </div>
        )}
        {chart?.kind === "grouped" && rows.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">{chart.label}</p>
            <GroupedBarChart rows={rows} x={chart.x} series={chart.series} />
          </div>
        )}
        {data && (rows.length > 15 ? (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Show all {rows.length} rows</summary>
            <div className="mt-2"><DataTable rows={rows} /></div>
          </details>
        ) : (
          <DataTable rows={rows} />
        ))}
      </CardContent>
    </Card>
  );
}

// Plain-language reading of the semantic-vs-statistical numbers, derived from
// the rows themselves so it always matches the data (no hard-coded claims).
function SemanticFindings({ rows }: { rows: Row[] }) {
  const get = (prefix: string) =>
    Number(rows.find((r) => String(r.pair_group).trim().startsWith(prefix))?.avg_return_corr);
  const semantic = get("Semantic top-5");
  const sameSemantic = get("...of which same sector");
  const crossSemantic = get("...of which different sector");
  const sector = get("Same-sector");
  const random = get("Random");
  if ([semantic, sector, random].some(Number.isNaN)) return null;

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
      <p>
        Pairs of companies with similar descriptions have an average return correlation of <b>{semantic.toFixed(3)}</b>,
        versus <b>{random.toFixed(3)}</b> for random pairs ({(semantic / random).toFixed(1)}× higher) and{" "}
        <b>{sector.toFixed(3)}</b> for same-sector pairs. So semantic neighbours{" "}
        {semantic > sector ? "co-move MORE than" : "co-move LESS than"} simple same-sector pairs.
      </p>
      {!Number.isNaN(crossSemantic) && (
        <p className="mt-1">
          Split by sector: semantic neighbours in the same sector average <b>{sameSemantic.toFixed(3)}</b>
          {sameSemantic > sector ? " (above the same-sector average, so within a sector the embeddings pick out the closest movers)" : ""}; those in a
          different sector average <b>{crossSemantic.toFixed(3)}</b>
          {Math.abs(crossSemantic - random) < 0.05 ? ", close to random: across sectors, description similarity adds little" : ""}.
        </p>
      )}
    </div>
  );
}

function VectorFindings({ rows }: { rows: Row[] }) {
  const closer = rows.filter((r) => Number(r.within_sector_distance) < Number(r.cross_sector_distance)).length;
  return (
    <p className="rounded-md border bg-muted/40 p-3 text-sm">
      In <b>{closer} of {rows.length}</b> sectors, companies&apos; descriptions are closer (smaller cosine distance) to their own
      sector than to other sectors, although the model never saw the sector label. Higher ratio = sharper sector clustering.
    </p>
  );
}
