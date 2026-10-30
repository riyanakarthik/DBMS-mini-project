# Problem Statement

## Project
**EquiVector: A Hybrid SQL–Vector Platform for Stock Market Analytics and Semantic Company Discovery**
PES University · DBMS Experiential Learning, Level 3 · Option 2 (SQL + Vector database)

## The problem
An investor or analyst who looks at one company usually asks two different questions:

1. **"Which companies are similar to this one?"** That is, which ones *do the same kind of business*.
2. **"Which stocks move together with this one?"** That is, which ones are *statistically related* in the market.

Today these questions are answered with different tools and different data. Similarity of business is judged from free-text company descriptions, by reading them or by coarse labels such as "sector". Co-movement is judged from structured price history, using correlations of returns. The two are rarely put side by side. So it is hard to answer a third question that matters for diversification:

3. **Does "similar business" actually mean "moves together"?** For example: if I hold JPMorgan, does buying a company that *describes itself* like JPMorgan diversify me, or does it just add more of the same risk?

The two kinds of data also need different database technology:
- **Prices, identities, users and watchlists** are structured. They need exact lookups, joins, aggregates, window functions, constraints and transactions: a **relational database**.
- **Company descriptions** are unstructured text. "Similar meaning" cannot be found with `=` or `LIKE`. For example, "chips" vs "semiconductors", or Nike vs Ford, which share the same sector label. This needs **embeddings and nearest-neighbour search**: a **vector database**.

## What EquiVector does
EquiVector stores structured market data in **PostgreSQL** and the meaning of each company's description as a 384-dimensional embedding in **pgvector**, both in the same database. On top of that it provides:

- a dashboard (top movers from a SQL view, sector view, price history),
- **semantic company search** (nearest neighbours by description, cosine distance, HNSW index),
- the project's original feature, **Semantic vs Statistical Similarity**: for any company, its top-5 *description* neighbours next to its top-5 *return-correlation* neighbours (computed in SQL with `LAG` + `corr()`), their overlap and Jaccard score, and a report testing across all 92 companies whether semantic similarity predicts return correlation,
- nine analytical SQL reports,
- per-user watchlists written with real transactions and an audit log maintained by a trigger,
- login with two roles (analyst = read/write, viewer = read-only), enforced in the API and in the database.

## Why it is not a CRUD application
The core value is analytical. It comes from window functions over 25,300 price rows, pairwise correlation of 4,186 company pairs, vector nearest-neighbour search, and comparing the two kinds of similarity. Create/update/delete exist (watchlists), but they are a small part, and even they are done as audited transactions.

## Headline finding (from the real data, see [testing-results.md](testing-results.md) and [important-queries.md](important-queries.md))
Pairs of companies with similar descriptions have an average 1-year daily-return correlation of **0.295**. That is about 3× the **0.095** of random pairs, but *below* the **0.321** of simple same-sector pairs. Within a sector, description neighbours co-move more than average (**0.461**); across sectors they barely do better than random (**0.129**). Semantic similarity predicts co-movement mostly *through* sector, not beyond it.
