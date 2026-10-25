import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Landing page. Each card links to a page built in Phase 3.
const sections = [
  { href: "/dashboard", title: "Dashboard", desc: "Top movers and sector overview (SQL view)" },
  { href: "/search", title: "Similar companies", desc: "Semantic vs statistical similarity (pgvector + corr())" },
  { href: "/reports", title: "Reports", desc: "Analytical SQL reports with charts" },
  { href: "/watchlist", title: "Watchlist", desc: "Your watched companies (transactional writes)" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-semibold">EquiVector</h1>
      <p className="mt-2 text-muted-foreground">
        Hybrid SQL + vector platform for stock market analytics and semantic company discovery.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
