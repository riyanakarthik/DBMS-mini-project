"""Step 1 of the seed pipeline: download raw data. Writes only to seed/data/raw/.

Sources
  - SEC company_tickers.json (free, no key): ticker -> CIK -> legal name.
  - yfinance:
      .info  -> sector, industry, longBusinessSummary (the description we embed)
      download(auto_adjust=True) -> daily OHLCV, adjusted for splits and dividends,
      so daily returns are not distorted by split jumps.

Nothing here is invented. If a ticker fails it is recorded in
fetch_report.json and dropped later by clean_data.py.

Usage:  .venv/bin/python fetch_data.py [--days 400] [--sec-only]
Needs SEC_USER_AGENT="Your Name your@email" in .env.local (SEC returns 403
without a contact in the User-Agent).
"""

import argparse
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
RAW = HERE / "data" / "raw"
SEC_URL = "https://www.sec.gov/files/company_tickers.json"
load_dotenv(HERE.parent / ".env.local")


def read_tickers() -> list[str]:
    tickers = []
    for line in (HERE / "tickers.txt").read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        tickers.extend(line.split())
    return list(dict.fromkeys(tickers))  # de-duplicate, keep order


def fetch_sec() -> dict:
    # SEC fair-access policy: automated clients must send "Name email" as User-Agent.
    agent = os.environ.get("SEC_USER_AGENT")
    if not agent:
        raise RuntimeError("SEC_USER_AGENT is not set (add it to .env.local)")
    resp = requests.get(SEC_URL, headers={"User-Agent": agent}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    (RAW / "sec_company_tickers.json").write_text(json.dumps(data))
    return data


def fetch_info(ticker: str, attempts: int = 3) -> dict:
    """yfinance .info with retry/backoff (Yahoo rate-limits bursts)."""
    last_err = None
    for i in range(attempts):
        try:
            info = yf.Ticker(ticker).info
            return {
                "ticker": ticker,
                "long_name": info.get("longName") or info.get("shortName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "description": info.get("longBusinessSummary"),
            }
        except Exception as e:  # network errors, 429s, parse errors
            last_err = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{ticker}: {last_err}")


def fetch_prices(tickers: list[str], start: date, end: date) -> pd.DataFrame:
    wide = yf.download(
        tickers, start=start.isoformat(), end=end.isoformat(),
        auto_adjust=True, group_by="ticker", threads=True, progress=False,
    )
    frames = []
    for t in tickers:
        if t not in wide.columns.get_level_values(0):
            continue
        df = wide[t].dropna(how="all").reset_index()
        df.columns = [str(c).lower() for c in df.columns]
        df.insert(0, "ticker", t)
        frames.append(df.rename(columns={"date": "trade_date"}))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=400,
                    help="calendar days of history (400 ~ 13 months, enough for 1y of returns)")
    ap.add_argument("--sec-only", action="store_true", help="only (re)download the SEC CIK file")
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    tickers = read_tickers()
    end = date.today() + timedelta(days=1)  # yfinance 'end' is exclusive
    start = end - timedelta(days=args.days)
    report = {"fetched_at": datetime.now(timezone.utc).isoformat(), "tickers_requested": len(tickers),
              "price_window": [start.isoformat(), end.isoformat()], "errors": []}

    print("SEC company_tickers.json ...")
    try:
        print(f"  {len(fetch_sec())} SEC entries")
    except Exception as e:
        print(f"  FAILED: {e}")
        if args.sec_only:
            raise SystemExit(1)
        report["errors"].append(f"sec {e}")
    if args.sec_only:
        return

    print(f"yfinance .info for {len(tickers)} tickers ...")
    infos = []
    for i, t in enumerate(tickers, 1):
        try:
            infos.append(fetch_info(t))
        except Exception as e:
            report["errors"].append(f"info {e}")
            print(f"  FAILED {e}")
        if i % 10 == 0:
            print(f"  {i}/{len(tickers)}")
        time.sleep(0.3)  # be polite to Yahoo
    pd.DataFrame(infos).to_csv(RAW / "info.csv", index=False)

    print(f"yfinance daily prices {start} .. {end} ...")
    prices = fetch_prices(tickers, start, end)
    missing = sorted(set(tickers) - set(prices["ticker"].unique() if len(prices) else []))
    for t in missing:
        report["errors"].append(f"prices {t}: no rows returned")
    prices.to_csv(RAW / "prices.csv", index=False)

    report.update(info_rows=len(infos), price_rows=len(prices), tickers_with_prices=len(tickers) - len(missing))
    (RAW / "fetch_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: v for k, v in report.items() if k != "errors"}, indent=2))
    print(f"errors: {len(report['errors'])}")
    for e in report["errors"]:
        print("  ", e)


if __name__ == "__main__":
    main()
