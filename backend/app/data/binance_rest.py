"""Incremental kline updates via the Binance REST API.

Use this to top up the Parquet store with the last few days of candles after the
bulk Vision dumps run out (Vision lags real time by a day or two).
"""

from __future__ import annotations

import logging

import httpx
import polars as pl

from app.config import settings
from app.data.store import write_klines

log = logging.getLogger(__name__)

_REST_PATH = "/fapi/v1/klines"  # USD-M futures public endpoint


async def fetch_recent_klines(
    symbol: str,
    timeframe: str = "1h",
    *,
    limit: int = 500,
) -> int:
    """Pull the most recent `limit` candles and merge into the store. Returns rows written."""
    base = "https://fapi.binance.com"
    url = f"{base}{_REST_PATH}"
    params = {"symbol": symbol, "interval": timeframe, "limit": str(limit)}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        rows = resp.json()

    if not rows:
        return 0

    df = pl.DataFrame(
        rows,
        schema={
            "open_time": pl.Int64,
            "open": pl.Utf8,
            "high": pl.Utf8,
            "low": pl.Utf8,
            "close": pl.Utf8,
            "volume": pl.Utf8,
            "close_time": pl.Int64,
            "quote_volume": pl.Utf8,
            "trades": pl.Int64,
            "taker_buy_base": pl.Utf8,
            "taker_buy_quote": pl.Utf8,
            "ignore": pl.Utf8,
        },
        orient="row",
    )

    df = df.with_columns(
        pl.from_epoch(pl.col("open_time"), time_unit="ms").alias("open_time"),
        pl.from_epoch(pl.col("close_time"), time_unit="ms").alias("close_time"),
        pl.col("open").cast(pl.Float64),
        pl.col("high").cast(pl.Float64),
        pl.col("low").cast(pl.Float64),
        pl.col("close").cast(pl.Float64),
        pl.col("volume").cast(pl.Float64),
        pl.col("quote_volume").cast(pl.Float64),
        pl.col("taker_buy_base").cast(pl.Float64),
        pl.col("taker_buy_quote").cast(pl.Float64),
    ).drop("ignore")

    written = write_klines(df, symbol, timeframe)
    log.info("incremental: %s %s — %d rows merged", symbol, timeframe, written)
    return written


# unused but kept so config import path compiles cleanly
_ = settings
