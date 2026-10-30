# Database Choice and Justification

The requirements allow **Option 1 (SQL + NoSQL)** or **Option 2 (SQL + Vector database)**. EquiVector uses **Option 2**:

| Paradigm | Product | Holds |
|---|---|---|
| SQL (mandatory) | **PostgreSQL 17**, hosted on Supabase | companies, prices, profiles, watchlists, activity_log |
| Vector | **pgvector 0.8** extension inside the same PostgreSQL | `companies.description_embedding VECTOR(384)` + HNSW index |

The rule in the requirements is that the technology must follow from the nature of the data. Below, each type of data is matched with the reason it lives where it does.

## 1. Structured data → PostgreSQL (relational)
| Data | Why relational |
|---|---|
| Daily prices (25,300 rows) | Fixed columns; a natural composite key `(cik, trade_date)`; needs range scans by date, `JOIN` to companies, aggregates (`AVG`, `corr()`), and window functions (`LAG` for daily returns, `ROW_NUMBER` for ranking). Validation rules such as "high ≥ open, close, low" and "no weekend dates" are CHECK constraints. |
| Company identity (CIK, ticker, name, sector) | Exact lookups and uniqueness (`UNIQUE (ticker)`, CIK format CHECK); referenced by three other tables through foreign keys. |
| Users, roles, watchlists | A many-to-many relationship (profiles ↔ companies) with attributes (`note`, `created_at`); integrity across tables (FKs with CASCADE / SET NULL); the role is a CHECK-constrained value. |
| Audit log | Must be written **atomically** with the change it records. That needs ACID transactions (`BEGIN … COMMIT / ROLLBACK`) and triggers, which are core relational features. |

A document store or vector store gives none of these guarantees (multi-table transactions, declarative constraints, `corr()`, window functions) in a way that is as easy to explain and verify.

## 2. Unstructured descriptions → pgvector (vector)
"Which companies do similar things?" has **no exact answer**, so `=`, `LIKE` or full-text keyword search cannot express it:
- Keywords miss synonyms: "chips", "semiconductors" and "processors" don't match each other.
- The `sector` label is too coarse. Tesla, Ford, Nike and McDonald's are all "Consumer Cyclical".

Converting each description into a 384-dimensional embedding turns "similar meaning" into "small cosine distance". Finding similar companies then becomes a **k-nearest-neighbour search**, which is exactly what a vector database is for: a `VECTOR` type, a distance operator (`<=>`), and an approximate-nearest-neighbour index (HNSW). Our report shows this captures real structure: in **all 11 sectors**, descriptions are closer to their own sector than to other sectors, although the model never saw the sector label ([important-queries.md](important-queries.md), report 9).

## 3. Why pgvector and not a separate vector database (Pinecone, Qdrant, Chroma)
1. **The vector belongs to the same entity as the relational row.** An embedding describes one company. In pgvector it is a column on that company's row, keyed by the same `cik`, so there is no second ID space to keep in sync.
2. **The project's main feature needs both in one query.** The semantic-vs-statistical report joins description distance (`<=>`) with return correlations computed from `prices` (`LAG` + `corr()`) and with `sector`, all in one SQL statement. With Pinecone this would mean querying two systems and joining in application code.
3. **Consistency and transactions.** When a description changes, `seed/load_data.py` resets its embedding to NULL *in the same transaction* (`CASE WHEN description IS DISTINCT FROM … THEN NULL`). Across two databases that guarantee is lost.
4. **Scale fits.** 92 vectors × 384 floats is tiny. A dedicated vector service would add cost, a network hop and another credential with no benefit. HNSW in pgvector would still work at hundreds of thousands of rows.
5. **It is still a real vector database.** pgvector is listed explicitly under Option 2 in the requirements ("PostgreSQL with pgvector"), and we use its vector-specific features: the `VECTOR(n)` type, the cosine operator, and HNSW with `vector_cosine_ops`.

## 4. Why not MongoDB (Option 1)
Our non-relational data is **not** "documents with flexible schema". It is free text whose useful property is its *meaning*. MongoDB would store the text, but finding similar companies would still need embeddings and vector search (Atlas Vector Search). That is the same idea as pgvector, in a second system, without joins to the price data. Every other entity in the project has a fixed schema and relationships, which is where a relational database is strongest. Adding MongoDB would be "technology for demonstration", which the requirements (§18) warn against.

## 5. Why Supabase as the host
A managed PostgreSQL with pgvector available as an extension, plus a built-in authentication service (Supabase Auth), so we store **no passwords** ourselves. We use it only as a Postgres host and an auth provider. All data access goes through our own Next.js API using the `pg` driver and raw SQL. Supabase's auto-generated REST API is blocked by Row Level Security (`db/security.sql`).
