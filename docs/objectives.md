# Objectives

1. **Design a correct relational schema** for market data and users: 5 tables in 3NF (except the deliberately denormalised `sector`/`industry` text; see [conclusion-and-future-work.md](conclusion-and-future-work.md)). Use a Chen-notation ER diagram, composite and surrogate keys where each is appropriate, and named constraints.
2. **Validate data in the database itself** with NOT NULL, CHECK, UNIQUE, FOREIGN KEY and triggers, so bad data is rejected no matter which client writes it.
3. **Store and search unstructured text by meaning**: embed every company description (all-MiniLM-L6-v2, 384-dim, normalised), store it in a `VECTOR(384)` column, index it with HNSW (cosine), and retrieve top-k neighbours with `<=>`.
4. **Demonstrate the required SQL features with real use, not toy examples:**
   - DDL: CREATE, ALTER (migration 001), DROP (migration 002)
   - DML: INSERT, UPDATE, DELETE, SELECT
   - queries with JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries, window functions
   - at least 4 advanced SQL features: view, index, trigger, transaction (plus trigger functions)
   - 1 vector feature (similarity search)
5. **Answer an original analytical question**: does semantic similarity of businesses predict statistical co-movement of their stocks? Report the answer honestly, whatever it is.
6. **Build a usable Next.js web application** with dashboards, search, filters, forms, tables and charts. It talks to the database only through a server-side API layer, with credentials in environment variables.
7. **Secure it**: Supabase Auth handles login (we store no passwords), there are two roles (analyst / viewer) enforced in the API (401/403) and in the database, and Row Level Security blocks Supabase's public REST API.
8. **Prove it works**: repeatable test scripts for constraints, triggers, transaction rollback and roles, with real recorded outputs.
