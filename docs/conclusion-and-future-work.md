# Conclusion and Future Work

## Conclusion
EquiVector shows that one PostgreSQL database can serve two very different kinds of data, each in the form that suits it:
- structured market data in **relational tables** with 25 named constraints, a view, indexes, 3 triggers and transactions;
- unstructured company descriptions as **384-dimensional embeddings in pgvector**, searched by cosine distance with an HNSW index.

Because both live in the same database, the project could ask a question neither could answer alone: **does similar business mean similar stock behaviour?** On our data the answer is *partly, and mostly through sector*. Description neighbours co-move about 3× more than random pairs (average return correlation 0.295 vs 0.095), but less than same-sector pairs (0.321). Within a sector they pick out the strongest co-movers (0.461). Across sectors they are close to random (0.129; correlation between cosine similarity and return correlation 0.075). The embeddings clearly encode industry structure (closer within sector in 11/11 sectors), but they describe *what a company does*, not *how its stock is priced*.

The application provides this through a Next.js interface backed by an API layer that runs only parameterised SQL from version-controlled files. It has two roles enforced in the API and in the database, and recorded tests for constraints, triggers, rollback and roles.

## Limitations (honest)
| Limitation | Effect | Detail |
|---|---|---|
| **Only 92 companies** | Small samples per sector (6–12); 307 semantic pairs, 356 same-sector pairs | Large US caps only, chosen by hand (`seed/tickers.txt`), so there is selection bias. |
| **About 1 year of daily data** | Correlations come from ~250 daily returns in one market regime | 2025-09-22 → 2026-10-23. Correlations change over time; no rolling windows. |
| **256-token embedding cutoff** | The tail of long descriptions is ignored | 55 of 92 descriptions (60%) exceed 256 tokens (median 277.5, max 579). |
| **Small general-purpose model** | Some weak neighbours | all-MiniLM-L6-v2 is not finance-tuned; e.g. GE Aerospace is XOM's 4th neighbour. |
| **Sector not normalised** | `companies.sector`/`industry` are repeated text; `industry → sector` is a transitive dependency (not strict 3NF) | Acceptable for read-only reference data loaded once; a `sectors` table would remove it. |
| **yfinance as the data source** | Unofficial API; sector labels and descriptions are Yahoo's | A one-off batch; the cleaned CSVs are committed so the demo does not depend on it. |
| **Descriptive statistics only** | No significance tests; pairs share companies, so they are not independent | The "random" group is a deterministic hash-ordered sample of one size. |
| **Role enforcement in the DB is per row owner** | The app connects as one database user, so the DB trigger checks the role of the row's `user_id`, not of a database login | The API always sets `user_id` from the verified session; RLS policies per Supabase user would be the stricter alternative. |
| **TLS without certificate verification** | `ssl: { rejectUnauthorized: false }` in `lib/db.ts` | Encrypted, but the server certificate is not verified; adding Supabase's CA certificate would fix it. |
| **Node 20** | supabase-js warns that Node ≤ 20 is deprecated; the role-test script needs `--experimental-websocket` | Upgrade to Node 22. |
| **No browser-automation tests; email confirmation untested** | See [testing-results.md](testing-results.md) | |
| **Git history** | All commits so far come from one machine/author, on one branch | Individual contributions are not yet visible in Git (rubric §2, §15). |

## Future work
1. **More data:** a few hundred companies, 3–5 years of prices, and rolling-window correlations to see whether the semantic signal is stable over time.
2. **Better embeddings:** a finance-specific or larger model; chunk long descriptions and average the chunks to remove the 256-token cutoff; compare models in the same report.
3. **Free-text semantic search** ("cloud security companies"): embed the query with the same model behind an API endpoint, then the same `<=>` top-k.
4. **Hybrid retrieval:** combine `tsvector` full-text search with vector similarity (another advanced feature from §7).
5. **Normalise sector/industry** into lookup tables, and add fundamentals (market cap, P/E) as further relational data.
6. **Materialised view for pair statistics** (4,186 pairs), refreshed after each load, so the novelty report is instant.
7. **Per-user RLS policies** (`auth.uid()`) so the database itself knows the logged-in user; an admin page for roles.
8. **Statistical rigour:** permutation tests or bootstrap confidence intervals for the group differences.
9. **Automated UI tests** (Playwright) and CI running `npm run build`, the SQL tests and `npm run test:roles`.
