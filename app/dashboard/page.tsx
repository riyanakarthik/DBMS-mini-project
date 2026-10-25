"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { PriceLineChart, SimpleBarChart } from "@/components/charts";
import { useFetch } from "@/lib/use-fetch";

type Mover = {
  ticker: string;
  name: string;
  sector: string;
  prev_date: string;
  trade_date: string;
  prev_close: number;
  close: number;
  pct_change: number;
  volume: number;
};
type Company = { ticker: string; name: string; sector: string };
type Price = { trade_date: string; close: number };
type ReportResult = { rows: Record<string, unknown>[] };

const selectClass = "h-9 rounded-md border bg-background px-3 text-sm";

export default function DashboardPage() {
  const movers = useFetch<Mover[]>("/api/top-movers");
  // Sector view: the HAVING report with filters opened up (more than 0
  // companies, average above -1000%) = every sector's average 1-year change.
  const sectorReturns = useFetch<ReportResult>("/api/reports/sector-having?min_companies=0&min_avg_pct=-1000");
  const sectorSummary = useFetch<ReportResult>("/api/reports/sector-summary");
  const companies = useFetch<Company[]>("/api/companies");

  const [ticker, setTicker] = useState("AAPL");
  const [sector, setSector] = useState("");
  const prices = useFetch<Price[]>(`/api/prices?ticker=${ticker}`);

  const all = movers.data ?? [];
  const gainers = all.filter((m) => m.pct_change > 0).length;
  const losers = all.filter((m) => m.pct_change < 0).length;
  // chart: the 8 biggest gainers and 8 biggest losers (view is sorted desc)
  const extremes = all.length > 16 ? [...all.slice(0, 8), ...all.slice(-8)] : all;
  const sectors = [...new Set(all.map((m) => m.sector))].sort();
  const filtered = sector ? all.filter((m) => m.sector === sector) : all;

  const series = prices.data ?? [];
  const first = series[0]?.close;
  const last = series.at(-1)?.close;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {movers.error && <p className="text-sm text-red-600">{movers.error}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Latest trading day" value={all[0]?.trade_date ?? "…"} />
        <Stat label="Compared with" value={all[0]?.prev_date ?? "…"} />
        <Stat label="Gainers" value={movers.data ? String(gainers) : "…"} />
        <Stat label="Losers" value={movers.data ? String(losers) : "…"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top movers</CardTitle>
          <CardDescription>
            From the <code>top_movers</code> view: % change between the two latest trading days. Chart shows
            the 8 biggest gainers and 8 biggest losers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SimpleBarChart rows={extremes} x="ticker" y="pct_change" diverging />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="sector">Filter by sector</label>
            <select id="sector" className={selectClass} value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <DataTable
              rows={filtered}
              columns={["ticker", "name", "sector", "prev_close", "close", "pct_change", "volume"]}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sector view: average 1-year % change</CardTitle>
            <CardDescription>Average of each company&apos;s first-to-last close over the last year.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart rows={sectorReturns.data?.rows ?? []} x="sector" y="avg_pct_change_1y" diverging />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sector view: price and volume</CardTitle>
            <CardDescription>Average close and average daily volume, all loaded days.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={sectorSummary.data?.rows ?? []}
              columns={["sector", "companies", "avg_close", "avg_daily_volume"]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Price history</CardTitle>
            <CardDescription>
              Daily close (split/dividend-adjusted)
              {first && last ? ` · ${series[0].trade_date} → ${series.at(-1)!.trade_date}: ${(((last - first) / first) * 100).toFixed(1)}%` : ""}
            </CardDescription>
          </div>
          <select aria-label="Company" className={selectClass} value={ticker} onChange={(e) => setTicker(e.target.value)}>
            {(companies.data ?? [{ ticker: "AAPL", name: "Apple Inc.", sector: "" }]).map((c) => (
              <option key={c.ticker} value={c.ticker}>
                {c.ticker} · {c.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {prices.error ? <p className="text-sm text-red-600">{prices.error}</p> : <PriceLineChart rows={series} />}
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
