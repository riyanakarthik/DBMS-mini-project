// Registry of the analytical reports on /reports. Each report is one SQL file
// in db/queries/reports/ plus how to present it. Shared by the API route
// (server) and the page (client), so it must not import server-only code.

export type ReportParam = { name: string; label: string; default: number };

export type ReportChart =
  // one bar per row; "diverging" colours negatives red and positives blue
  | { kind: "bar"; x: string; y: string; label: string; diverging?: boolean; limit?: number }
  // two bars per row (two measures on the SAME unit, so one axis is honest)
  | { kind: "grouped"; x: string; series: { key: string; label: string }[]; label: string };

export type ReportDef = {
  slug: string;
  title: string;
  concepts: string; // which SQL features it demonstrates
  question: string;
  file: string; // relative to db/queries/
  params?: ReportParam[];
  chart?: ReportChart;
};

export const REPORTS: ReportDef[] = [
  {
    slug: "sector-summary",
    title: "Average close and daily volume per sector",
    concepts: "JOIN · GROUP BY · AVG / COUNT(DISTINCT) · ORDER BY",
    question: "Which sectors trade most heavily, and at what typical price level?",
    file: "reports/sector_summary.sql",
    chart: { kind: "bar", x: "sector", y: "avg_daily_volume", label: "Average daily volume (shares)" },
  },
  {
    slug: "sector-having",
    title: "Large sectors with positive average 1-year return",
    concepts: "CTE · JOIN · GROUP BY · HAVING",
    question: "Which sectors have more than N companies AND an average 1-year % change above X?",
    file: "reports/sector_having.sql",
    params: [
      { name: "min_companies", label: "More than N companies", default: 6 },
      { name: "min_avg_pct", label: "Average 1-year % change above X", default: 0 },
    ],
    chart: { kind: "bar", x: "sector", y: "avg_pct_change_1y", label: "Average 1-year % change", diverging: true },
  },
  {
    slug: "top-movers",
    title: "Top 10 movers on the latest trading day",
    concepts: "VIEW (top_movers) · window over latest two dates · LIMIT",
    question: "Which stocks rose most between the last two trading days?",
    file: "reports/top_movers_top10.sql",
    chart: { kind: "bar", x: "ticker", y: "pct_change", label: "Daily % change", diverging: true },
  },
  {
    slug: "above-own-average",
    title: "Latest close above the company's own average",
    concepts: "Correlated subqueries (in JOIN, WHERE and SELECT)",
    question: "Which companies are trading above their own average price for the period?",
    file: "reports/above_own_average.sql",
    chart: { kind: "bar", x: "ticker", y: "pct_above_avg", label: "% above own average close (top 15)", limit: 15 },
  },
  {
    slug: "most-watched",
    title: "Most-watched companies",
    concepts: "JOIN on the M:N table · GROUP BY · COUNT",
    question: "Which companies appear on the most users' watchlists?",
    file: "reports/most_watched.sql",
    chart: { kind: "bar", x: "ticker", y: "watchers", label: "Watchers" },
  },
  {
    slug: "activity-summary",
    title: "Activity log summary per action",
    concepts: "GROUP BY · COUNT · COUNT(DISTINCT) · MIN / MAX",
    question: "What has happened in the system, by trigger and by users?",
    file: "reports/activity_summary.sql",
    chart: { kind: "bar", x: "action", y: "events", label: "Events" },
  },
  {
    slug: "semantic-vs-statistical",
    title: "Does semantic similarity predict return correlation?",
    concepts: "LAG window · corr() · LATERAL top-k vector search · UNION ALL · pgvector <=>",
    question:
      "Average 1-year daily-return correlation of description-neighbour pairs vs same-sector pairs vs random pairs.",
    file: "reports/semantic_vs_statistical.sql",
    chart: { kind: "bar", x: "pair_group", y: "avg_return_corr", label: "Average return correlation of pairs" },
  },
  {
    slug: "semantic-vs-statistical-summary",
    title: "Semantic vs statistical: summary statistics",
    concepts: "corr() with FILTER · ROW_NUMBER window ranks · Jaccard overlap",
    question:
      "Correlation between cosine similarity and return correlation (overall / within sector / across sectors), and average top-5 overlap.",
    file: "reports/semantic_vs_statistical_summary.sql",
  },
  {
    slug: "sector-embedding-distance",
    title: "Vector report: do embeddings capture sectors?",
    concepts: "pgvector cosine distance <=> · self-JOIN · AVG with FILTER",
    question:
      "Per sector, average embedding distance to same-sector companies vs to other sectors (embeddings never saw the sector label).",
    file: "reports/sector_embedding_distance.sql",
    chart: {
      kind: "grouped",
      x: "sector",
      label: "Average cosine distance (lower = more similar descriptions)",
      series: [
        { key: "within_sector_distance", label: "Within sector" },
        { key: "cross_sector_distance", label: "Across sectors" },
      ],
    },
  },
];

export function findReport(slug: string): ReportDef | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
