"""Step 3 of the seed pipeline: load clean CSVs into Postgres.

  --batch 1  upsert companies.csv, then insert prices_batch1.csv  (Phase 1)
  --batch 2  insert prices_batch2.csv only                        (Phase 2: the
             AFTER INSERT ON prices trigger fires for each new row)

Each batch runs as ONE transaction: if anything fails, nothing is loaded.
Re-running is safe: existing rows are skipped (ON CONFLICT), not duplicated.

Reads DATABASE_URL from the environment or ../.env.local.
Usage:  .venv/bin/python load_data.py --batch 1
"""

import argparse
import csv
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
CLEAN = HERE / "data" / "clean"

# Upsert: insert new companies; for existing ones refresh the text columns.
# If the description text changed, the old embedding no longer matches it,
# so it is reset to NULL and embed_descriptions.py will recompute it.
UPSERT_COMPANY = """
INSERT INTO companies (cik, ticker, name, sector, industry, description)
VALUES (%s, %s, %s, %s, %s, %s)
ON CONFLICT (cik) DO UPDATE SET
    ticker   = EXCLUDED.ticker,
    name     = EXCLUDED.name,
    sector   = EXCLUDED.sector,
    industry = EXCLUDED.industry,
    description_embedding = CASE
        WHEN companies.description IS DISTINCT FROM EXCLUDED.description THEN NULL
        ELSE companies.description_embedding
    END,
    description = EXCLUDED.description
"""

# Prices are bulk-loaded with COPY into a temporary staging table (fast over
# the network), then moved into the real table with INSERT ... SELECT so that
# all constraints and triggers on `prices` apply, and rows that already exist
# are skipped rather than failing the whole batch.
CREATE_STAGING = "CREATE TEMP TABLE staging_prices (LIKE prices INCLUDING DEFAULTS) ON COMMIT DROP"
COPY_STAGING = "COPY staging_prices (cik, trade_date, open, high, low, close, volume) FROM STDIN"
MOVE_STAGING = """
INSERT INTO prices (cik, trade_date, open, high, low, close, volume)
SELECT cik, trade_date, open, high, low, close, volume
FROM staging_prices
ON CONFLICT (cik, trade_date) DO NOTHING
"""


def read_csv(name: str) -> list[dict]:
    path = CLEAN / name
    if not path.exists():
        raise SystemExit(f"{path} missing: run clean_data.py first")
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def load_prices(cur, rows: list[dict]) -> int:
    cur.execute(CREATE_STAGING)
    cols = ["cik", "trade_date", "open", "high", "low", "close", "volume"]
    with cur.copy(COPY_STAGING) as copy:
        for r in rows:
            copy.write_row([r[c] for c in cols])
    cur.execute(MOVE_STAGING)
    return cur.rowcount


def counts(cur) -> dict:
    cur.execute("""SELECT (SELECT count(*) FROM companies), (SELECT count(*) FROM prices),
                          (SELECT min(trade_date) FROM prices), (SELECT max(trade_date) FROM prices)""")
    c, p, lo, hi = cur.fetchone()
    return {"companies": c, "prices": p, "first_date": str(lo), "last_date": str(hi)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, choices=[1, 2], required=True)
    args = ap.parse_args()

    load_dotenv(HERE.parent / ".env.local")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (see .env.local.example)")

    # `with psycopg.connect()` = one transaction: COMMIT on success, ROLLBACK on error.
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        print("before:", counts(cur))
        if args.batch == 1:
            companies = read_csv("companies.csv")
            cur.executemany(UPSERT_COMPANY, [
                (r["cik"], r["ticker"], r["name"], r["sector"], r["industry"], r["description"])
                for r in companies
            ])
            print(f"companies upserted: {len(companies)}")
        rows = read_csv(f"prices_batch{args.batch}.csv")
        inserted = load_prices(cur, rows)
        print(f"prices batch {args.batch}: {len(rows)} rows in file, {inserted} inserted, "
              f"{len(rows) - inserted} already present")
        print("after: ", counts(cur))


if __name__ == "__main__":
    main()
