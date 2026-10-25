import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Record<string, unknown>;

export function formatCell(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (key.includes("volume") || Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.replace("T", " ").slice(0, 19);
  return String(v);
}

// Generic table: one column per key of the first row (SQL column names).
export function DataTable({
  rows,
  columns,
  highlight,
  extra,
}: {
  rows: Row[];
  columns?: string[];
  highlight?: (row: Row) => boolean;
  extra?: { header: string; cell: (row: Row) => ReactNode };
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>;
  const cols = columns ?? Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>
            ))}
            {extra && <TableHead>{extra.header}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i} className={highlight?.(r) ? "bg-blue-50" : undefined}>
              {cols.map((c) => (
                <TableCell
                  key={c}
                  className={typeof r[c] === "number" ? "text-right tabular-nums" : "max-w-xs truncate"}
                >
                  {formatCell(c, r[c])}
                </TableCell>
              ))}
              {extra && <TableCell>{extra.cell(r)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
