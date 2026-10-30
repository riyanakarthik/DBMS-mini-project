"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { useFetch } from "@/lib/use-fetch";
import { useMe } from "@/lib/use-me";

type Company = { cik: string; ticker: string; name: string; sector: string; industry: string };
type Neighbour = { ticker: string; name: string; sector: string; industry: string } & Record<string, unknown>;
type Similar = {
  company: Company & { description: string };
  semantic: Neighbour[];
  statistical: Neighbour[];
  overlap: string[];
  jaccard: number;
};

const selectClass = "h-9 rounded-md border bg-background px-3 text-sm";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sector, setSector] = useState("");
  const [ticker, setTicker] = useState("JPM");
  const [message, setMessage] = useState<string | null>(null);
  const { canWrite } = useMe(); // cosmetic: viewers don't get the write button

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const allCompanies = useFetch<Company[]>("/api/companies"); // for the sector list
  const params = new URLSearchParams();
  if (debounced) params.set("q", debounced);
  if (sector) params.set("sector", sector);
  const companies = useFetch<Company[]>(`/api/companies?${params}`);
  const similar = useFetch<Similar>(`/api/similar?ticker=${ticker}`);
  const sectors = [...new Set((allCompanies.data ?? []).map((c) => c.sector))].sort();

  const s = similar.data;
  const inBoth = (r: Record<string, unknown>) => !!s?.overlap.includes(String(r.ticker));

  async function addToWatchlist() {
    setMessage(null);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    });
    const body = await res.json();
    setMessage(res.ok ? `${ticker} added to your watchlist` : `Could not add: ${body.error}`);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Semantic vs statistical similarity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Companies that <em>describe</em> themselves alike (pgvector cosine distance on description embeddings)
          vs companies whose stock <em>moves</em> alike (Pearson correlation of 1-year daily returns, computed in SQL).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Pick a company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search ticker or name" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Sector" className={`${selectClass} w-full`} value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All sectors</option>
              {sectors.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <ul className="max-h-[28rem] overflow-y-auto text-sm">
              {(companies.data ?? []).map((c) => (
                <li key={c.ticker}>
                  <button
                    onClick={() => setTicker(c.ticker)}
                    className={`w-full rounded px-2 py-1 text-left hover:bg-muted ${c.ticker === ticker ? "bg-muted font-medium" : ""}`}
                  >
                    {c.ticker} <span className="text-muted-foreground">· {c.name}</span>
                  </button>
                </li>
              ))}
              {companies.data?.length === 0 && <li className="px-2 text-muted-foreground">No matches</li>}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {similar.error && <p className="text-sm text-red-600">{similar.error}</p>}
          {similar.loading && !s && <p className="text-sm text-muted-foreground">Computing…</p>}
          {s && (
            <>
              <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <CardTitle>
                      {s.company.ticker} · {s.company.name}
                    </CardTitle>
                    <CardDescription>
                      {s.company.sector} · {s.company.industry}
                    </CardDescription>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{s.company.description}</p>
                  </div>
                  <div className="flex gap-4">
                    <Metric label="Overlap" value={`${s.overlap.length} / 5`} />
                    <Metric label="Jaccard" value={s.jaccard.toFixed(2)} />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">In both lists:</span>
                  {s.overlap.length ? s.overlap.map((t) => <Badge key={t}>{t}</Badge>) : <span>none</span>}
                  {canWrite && (
                    <Button size="sm" variant="outline" className="ml-auto" onClick={addToWatchlist}>
                      Add {s.company.ticker} to watchlist
                    </Button>
                  )}
                  {message && <span className="w-full text-muted-foreground">{message}</span>}
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Semantic: nearest descriptions</CardTitle>
                    <CardDescription>
                      <code>ORDER BY description_embedding &lt;=&gt; query LIMIT 5</code> (HNSW, cosine)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable rows={s.semantic} columns={["ticker", "sector", "cosine_similarity"]} highlight={inBoth} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Statistical: most correlated returns</CardTitle>
                    <CardDescription>
                      <code>corr()</code> of daily returns from <code>LAG(close)</code>, last year
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable rows={s.statistical} columns={["ticker", "sector", "return_correlation"]} highlight={inBoth} />
                  </CardContent>
                </Card>
              </div>
              <p className="text-xs text-muted-foreground">
                Highlighted rows appear in both lists. Jaccard = |both| / |either|; two random top-5 lists would score about 0.03.
                Across all 92 companies, see the &ldquo;Does semantic similarity predict return correlation?&rdquo; report.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-4 py-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
