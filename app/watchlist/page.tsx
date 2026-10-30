"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { useFetch } from "@/lib/use-fetch";
import { useMe } from "@/lib/use-me";

type Entry = {
  ticker: string;
  name: string;
  sector: string;
  cik: string;
  note: string | null;
  created_at: string;
  updated_at: string | null;
  latest_close: number;
  latest_date: string;
};
type Company = { ticker: string; name: string };

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.constraint ? `${data.error} (${data.constraint})` : data.error);
  return data;
}

export default function WatchlistPage() {
  const list = useFetch<Entry[]>("/api/watchlist");
  // Cosmetic only: viewers don't see write controls. The API answers 403 anyway.
  const { me, canWrite } = useMe();
  const companies = useFetch<Company[]>("/api/companies");
  const [ticker, setTicker] = useState("");
  const [note, setNote] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(action: () => Promise<unknown>, success: string) {
    setStatus(null);
    try {
      await action();
      setStatus({ ok: true, text: success });
      list.reload();
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        {me && !canWrite && (
          <p className="mt-1 text-sm text-amber-700">
            You are logged in as a <b>viewer</b>: read-only access. Ask an admin to make you an analyst to add or edit entries.
          </p>
        )}
      </div>

      {canWrite && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a company</CardTitle>
          <CardDescription>
            One transaction: INSERT into <code>watchlists</code> + INSERT into <code>activity_log</code>, then COMMIT;
            if either fails, ROLLBACK leaves no trace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => send("POST", "/api/watchlist", { ticker, note }), `${ticker.toUpperCase()} added`).then(() => setNote(""));
            }}
          >
            <Input list="tickers" required placeholder="Ticker, e.g. NVDA" className="w-44" value={ticker} onChange={(e) => setTicker(e.target.value)} />
            <datalist id="tickers">
              {(companies.data ?? []).map((c) => (
                <option key={c.ticker} value={c.ticker}>{c.name}</option>
              ))}
            </datalist>
            <Input placeholder="Note (optional, max 500 chars)" className="min-w-64 flex-1" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit">Add</Button>
          </form>
          {status && <p className={`mt-3 text-sm ${status.ok ? "text-green-700" : "text-red-600"}`}>{status.text}</p>}
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your companies</CardTitle>
          <CardDescription>
            {canWrite ? "Edit a note (UPDATE) or remove a company (DELETE); each change is also logged." : "Your watchlist (read-only)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.error && <p className="text-sm text-red-600">{list.error}</p>}
          {list.data && (
            <DataTable
              rows={list.data}
              columns={["ticker", "sector", "latest_close", "latest_date", "updated_at"]}
              extra={{
                header: "Note",
                cell: (r) => {
                  const e = r as Entry;
                  if (!canWrite) return <span>{e.note ?? "—"}</span>;
                  const value = edits[e.cik] ?? e.note ?? "";
                  return (
                    <div className="flex min-w-80 gap-2">
                      <Input value={value} onChange={(ev) => setEdits({ ...edits, [e.cik]: ev.target.value })} />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={value === (e.note ?? "")}
                        onClick={() => run(() => send("PATCH", "/api/watchlist", { cik: e.cik, note: value }), `Note for ${e.ticker} saved`)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => run(() => send("DELETE", `/api/watchlist?cik=${e.cik}`), `${e.ticker} removed`)}
                      >
                        Remove
                      </Button>
                    </div>
                  );
                },
              }}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
