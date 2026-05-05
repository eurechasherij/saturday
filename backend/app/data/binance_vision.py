"""Bulk historical kline ingest from data.binance.vision.

Downloads monthly ZIP archives of klines (free, no API key, no rate limits worth caring about),
parses the CSVs into Polars frames, and writes them to the Parquet store.

Schema of Binance Vision klines CSV (no header):
  open_time, open, high, low, close, volume, close_time, quote_volume,
  trades, taker_buy_base, taker_buy_quote, ignore
"""

from __future__ import annotations

import io
import logging
import zipfile
from collections.abc import Iterator
from datetime import datetime
from typing import Literal

import httpx
import polars as pl

from app.config import settings
from app.data.store import write_klines

log = logging.getLogger(__name__)

Market = Literal["spot", "um", "cm"]  # um = USD-M futures, cm = COIN-M futures
_VALID_TIMEFRAMES = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"}


def _month_iter(start: str, end: str) -> Iterator[str]:
    """Yield 'YYYY-MM' strings inclusive."""
    sy, sm = (int(x) for x in start.split("-"))
    ey, em = (int(x) for x in end.split("-"))
    y, m = sy, sm
    while (y, m) <= (ey, em):
        yield f"{y:04d}-{m:02d}"
        m += 1
        if m > 12:
            m = 1
            y += 1


def _vision_url(symbol: str, timeframe: str, ym: str, market: Market = "um") -> str:
    base = settings.binance_vision_base
    seg = {"spot": "spot", "um": "futures/um", "cm": "futures/cm"}[market]
    return f"{base}/data/{seg}/monthly/klines/{symbol}/{timeframe}/{symbol}-{timeframe}-{ym}.zip"


def _parse_zip(content: bytes) -> pl.DataFrame:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        name = zf.namelist()[0]
        with zf.open(name) as f:
            raw = f.read()

    schema = {
        "open_time": pl.Int64,
        "open": pl.Float64,
        "high": pl.Float64,
        "low": pl.Float64,
        "close": pl.Float64,
        "volume": pl.Float64,
        "close_time": pl.Int64,
        "quote_volume": pl.Float64,
        "trades": pl.Int64,
        "taker_buy_base": pl.Float64,
        "taker_buy_quote": pl.Float64,
        "ignore": pl.Float64,
    }
    df = pl.read_csv(io.BytesIO(raw), has_header=False, new_columns=list(schema.keys()), schema=schema)

    # Newer Binance dumps prefix the first row with a header line; strip if so.
    # (read_csv with has_header=False normally handles, but some files contain it.)
    df = df.filter(pl.col("open_time").cast(pl.Int64, strict=False).is_not_null())

    # Binance returns ms epochs. Some recent dumps return us. Detect by magnitude.
    sample = df["open_time"][0] if df.height > 0 else 0
    unit = "us" if sample > 10**14 else "ms"

    df = df.with_columns(
        pl.from_epoch(pl.col("open_time"), time_unit=unit).alias("open_time"),
        pl.from_epoch(pl.col("close_time"), time_unit=unit).alias("close_time"),
    ).drop("ignore")
    return df


def ingest_range(
    symbol: str,
    timeframe: str = "1h",
    *,
    start: str,
    end: str | None = None,
    market: Market = "um",
) -> dict[str, object]:
    """Download + write all months in [start, end] for (symbol, timeframe).

    start/end are 'YYYY-MM'. end defaults to current month.
    Returns a small report dict.
    """
    if timeframe not in _VALID_TIMEFRAMES:
        raise ValueError(f"unsupported timeframe: {timeframe}")

    if end is None:
        now = datetime.utcnow()
        end = f"{now.year:04d}-{now.month:02d}"

    months = list(_month_iter(start, end))
    months_ok: list[str] = []
    months_missing: list[str] = []
    rows_written = 0

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        for ym in months:
            url = _vision_url(symbol, timeframe, ym, market)
            try:
                resp = client.get(url)
            except httpx.HTTPError as e:
                log.warning("network error fetching %s: %s", url, e)
                months_missing.append(ym)
                continue

            if resp.status_code == 404:
                months_missing.append(ym)
                continue
            resp.raise_for_status()

            df = _parse_zip(resp.content)
            written = write_klines(df, symbol, timeframe)
            rows_written += written
            months_ok.append(ym)
            log.info("ingested %s %s %s — %d rows", symbol, timeframe, ym, df.height)

    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "months_ok": months_ok,
        "months_missing": months_missing,
        "rows_written": rows_written,
    }


def _cli() -> None:
    import argparse

    p = argparse.ArgumentParser(description="Ingest Binance Vision klines into Parquet store")
    p.add_argument("symbol")
    p.add_argument("timeframe", default="1h", nargs="?")
    p.add_argument("--start", required=True, help="YYYY-MM")
    p.add_argument("--end", default=None, help="YYYY-MM (default: current month)")
    p.add_argument("--market", default="um", choices=["spot", "um", "cm"])
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    report = ingest_range(
        args.symbol,
        args.timeframe,
        start=args.start,
        end=args.end,
        market=args.market,
    )
    print(report)


if __name__ == "__main__":
    _cli()
