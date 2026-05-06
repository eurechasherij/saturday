"""Bulk historical kline ingest from data.binance.vision.

Downloads monthly ZIP archives of klines (free, no API key, no rate limits worth caring about),
parses the CSVs into Polars frames, and writes them to the Parquet store.

Schema of Binance Vision klines CSV (no header):
  open_time, open, high, low, close, volume, close_time, quote_volume,
  trades, taker_buy_base, taker_buy_quote, ignore

Two entry points:
  - `ingest_range_stream()` — async generator, yields per-month progress dicts.
    Used by the SSE endpoint to drive the UI.
  - `ingest_range()` — sync wrapper used by the CLI.
"""

from __future__ import annotations

import asyncio
import io
import logging
import zipfile
from collections.abc import AsyncIterator, Iterator
from datetime import datetime
from typing import Any, Literal

import httpx
import polars as pl

from app.config import settings
from app.data.store import write_klines

log = logging.getLogger(__name__)

Market = Literal["spot", "um", "cm"]
_VALID_TIMEFRAMES = {"1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"}


def _month_iter(start: str, end: str) -> Iterator[str]:
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
    # Binance Vision dumps started including a CSV header row in mid-2025.
    # Older months are headerless. Peek at the first bytes to decide.
    has_header = raw.lstrip()[:9].lower().startswith(b"open_time")
    df = pl.read_csv(
        io.BytesIO(raw),
        has_header=has_header,
        new_columns=list(schema.keys()),
        schema=schema,
    )
    df = df.filter(pl.col("open_time").cast(pl.Int64, strict=False).is_not_null())

    sample = df["open_time"][0] if df.height > 0 else 0
    unit = "us" if sample > 10**14 else "ms"

    df = df.with_columns(
        pl.from_epoch(pl.col("open_time"), time_unit=unit).alias("open_time"),
        pl.from_epoch(pl.col("close_time"), time_unit=unit).alias("close_time"),
    ).drop("ignore")
    return df


def _now_ym() -> str:
    n = datetime.utcnow()
    return f"{n.year:04d}-{n.month:02d}"


async def ingest_range_stream(
    symbol: str,
    timeframe: str = "1h",
    *,
    start: str,
    end: str | None = None,
    market: Market = "um",
) -> AsyncIterator[dict[str, Any]]:
    """Async generator yielding per-month progress events.

    Event types:
      started           {symbol, timeframe, months_total}
      month_done        {month, index, total, rows, rows_total}
      month_missing     {month, index, total, reason}
      month_failed      {month, index, total, reason}
      completed         {rows_total, months_ok, months_missing}
      error             {error}
    """
    if timeframe not in _VALID_TIMEFRAMES:
        yield {"type": "error", "error": f"unsupported timeframe: {timeframe}"}
        return

    if end is None:
        end = _now_ym()

    months = list(_month_iter(start, end))
    total = len(months)
    yield {
        "type": "started",
        "symbol": symbol,
        "timeframe": timeframe,
        "months_total": total,
        "start": start,
        "end": end,
    }

    rows_total = 0
    months_ok: list[str] = []
    months_missing: list[str] = []

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        for i, ym in enumerate(months, start=1):
            url = _vision_url(symbol, timeframe, ym, market)
            try:
                resp = await client.get(url)
            except httpx.HTTPError as e:
                log.warning("network error fetching %s: %s", url, e)
                months_missing.append(ym)
                yield {"type": "month_failed", "month": ym, "index": i, "total": total, "reason": str(e)}
                continue

            if resp.status_code == 404:
                months_missing.append(ym)
                yield {"type": "month_missing", "month": ym, "index": i, "total": total, "reason": "404"}
                continue
            if resp.status_code != 200:
                yield {"type": "month_failed", "month": ym, "index": i, "total": total, "reason": f"http {resp.status_code}"}
                continue

            try:
                df = await asyncio.to_thread(_parse_zip, resp.content)
                written = await asyncio.to_thread(write_klines, df, symbol, timeframe)
            except Exception as e:  # noqa: BLE001
                yield {"type": "month_failed", "month": ym, "index": i, "total": total, "reason": str(e)}
                continue

            rows_total += written
            months_ok.append(ym)
            yield {
                "type": "month_done",
                "month": ym,
                "index": i,
                "total": total,
                "rows": written,
                "rows_total": rows_total,
            }

    yield {
        "type": "completed",
        "rows_total": rows_total,
        "months_ok": months_ok,
        "months_missing": months_missing,
    }


def ingest_range(
    symbol: str,
    timeframe: str = "1h",
    *,
    start: str,
    end: str | None = None,
    market: Market = "um",
) -> dict[str, Any]:
    """Sync wrapper used by the CLI. Consumes the streaming generator and returns a final report."""
    async def _run() -> dict[str, Any]:
        last: dict[str, Any] = {}
        async for ev in ingest_range_stream(symbol, timeframe, start=start, end=end, market=market):
            log.info("ingest: %s", ev)
            last = ev
        return last

    return asyncio.run(_run())


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
    report = ingest_range(args.symbol, args.timeframe, start=args.start, end=args.end, market=args.market)
    print(report)


if __name__ == "__main__":
    _cli()
