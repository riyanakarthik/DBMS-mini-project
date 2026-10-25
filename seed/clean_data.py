"""Step 2 of the seed pipeline: clean raw data -> seed/data/clean/.

Reads data/raw/ (from fetch_data.py) and writes:
  companies.csv        cik, ticker, name, sector, industry, description
  prices_batch1.csv    all trading days except the last 5   ("week 1")
  prices_batch2.csv    the last 5 trading days              ("week 2", loaded in Phase 2
                                                              to show the trigger firing)
  clean_report.json    what was dropped and why

Rows are only ever DROPPED (with a counted reason), never repaired or
invented. The checks mirror the CHECK constraints in db/schema.sql, so
clean rows load without constraint errors.

Usage:  .venv/bin/python clean_data.py
"""

import json
import re
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw"
CLEAN = HERE / "data" / "clean"

MIN_DESC_CHARS = 100     # too-short descriptions make meaningless embeddings
MIN_PRICE_DAYS = 200     # need ~1 year of returns for the correlation feature
BATCH2_DAYS = 5          # last trading week becomes batch 2


def load_cik_map() -> pd.DataFrame:
    path = RAW / "sec_company_tickers.json"
    if not path.exists():
        raise SystemExit("data/raw/sec_company_tickers.json missing: run fetch_data.py --sec-only "
                         "(needs SEC_USER_AGENT in .env.local)")
    sec = pd.DataFrame(json.loads(path.read_text()).values())
    sec["cik"] = sec["cik_str"].astype(int).astype(str).str.zfill(10)  # 320193 -> 0000320193
    # A CIK can list several tickers (share classes); keep the first per ticker.
    return sec.drop_duplicates("ticker")[["ticker", "cik", "title"]]


def clean_companies(info: pd.DataFrame, sec: pd.DataFrame, drops: dict) -> pd.DataFrame:
    df = info.merge(sec, on="ticker", how="left")

    def drop(mask, reason):
        nonlocal df
        if mask.any():
            drops[reason] = sorted(df.loc[mask, "ticker"].tolist())
        df = df[~mask]

    drop(df["cik"].isna(), "company: no CIK in SEC file")
    drop(df["sector"].isna() | df["industry"].isna(), "company: missing sector/industry")
    # collapse runs of whitespace/newlines left over from the HTML source
    df["description"] = df["description"].fillna("").map(lambda s: re.sub(r"\s+", " ", s).strip())
    drop(df["description"].str.len() < MIN_DESC_CHARS, f"company: description < {MIN_DESC_CHARS} chars")
    drop(df["cik"].duplicated(keep="first"), "company: duplicate CIK (second share class)")

    # Prefer yfinance's display name ("Apple Inc."); SEC's title is the fallback.
    df["name"] = df["long_name"].fillna(df["title"])
    return df[["cik", "ticker", "name", "sector", "industry", "description"]].reset_index(drop=True)


def clean_prices(raw: pd.DataFrame, companies: pd.DataFrame, report: dict) -> pd.DataFrame:
    counts = {}
    df = raw.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date

    def drop(mask, reason):
        nonlocal df
        counts[reason] = int(mask.sum())
        df = df[~mask]

    drop(~df["ticker"].isin(companies["ticker"]), "company was dropped")
    drop(df[["open", "high", "low", "close", "volume"]].isna().any(axis=1), "null OHLCV")
    # Round to the NUMERIC(12,4) column scale. Rounding is monotonic, so it
    # cannot break the high/low ordering checked below.
    for c in ["open", "high", "low", "close"]:
        df[c] = df[c].round(4)
    drop((df[["open", "high", "low", "close"]] <= 0).any(axis=1), "non-positive price")
    drop(df["volume"] < 0, "negative volume")
    drop(df["high"] < df[["open", "close", "low"]].max(axis=1), "high is not the day's max")
    drop(df["low"] > df[["open", "close"]].min(axis=1), "low is not the day's min")
    drop(pd.to_datetime(df["trade_date"]).dt.day_of_week >= 5, "weekend date")
    drop(df.duplicated(["ticker", "trade_date"]), "duplicate (ticker, date)")
    df["volume"] = df["volume"].astype("int64")

    days = df.groupby("ticker").size()
    short = days[days < MIN_PRICE_DAYS].index
    counts[f"ticker has < {MIN_PRICE_DAYS} days"] = int(df["ticker"].isin(short).sum())
    df = df[~df["ticker"].isin(short)]
    report["dropped_price_rows"] = counts
    report["dropped_short_history_tickers"] = sorted(short.tolist())

    df = df.merge(companies[["ticker", "cik"]], on="ticker")
    return df[["cik", "trade_date", "open", "high", "low", "close", "volume"]]


def main():
    CLEAN.mkdir(parents=True, exist_ok=True)
    report = {"dropped_companies": {}}
    sec = load_cik_map()
    info = pd.read_csv(RAW / "info.csv")
    companies = clean_companies(info, sec, report["dropped_companies"])
    prices = clean_prices(pd.read_csv(RAW / "prices.csv"), companies, report)
    # keep only companies that still have price history
    companies = companies[companies["cik"].isin(prices["cik"])]

    dates = sorted(prices["trade_date"].unique())
    cutoff = dates[-BATCH2_DAYS]
    b1, b2 = prices[prices["trade_date"] < cutoff], prices[prices["trade_date"] >= cutoff]

    companies.to_csv(CLEAN / "companies.csv", index=False)
    b1.sort_values(["cik", "trade_date"]).to_csv(CLEAN / "prices_batch1.csv", index=False)
    b2.sort_values(["cik", "trade_date"]).to_csv(CLEAN / "prices_batch2.csv", index=False)

    report.update(
        companies=len(companies),
        sectors=companies["sector"].value_counts().to_dict(),
        batch1={"rows": len(b1), "from": str(dates[0]), "to": str(dates[-BATCH2_DAYS - 1])},
        batch2={"rows": len(b2), "from": str(cutoff), "to": str(dates[-1])},
    )
    (CLEAN / "clean_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
