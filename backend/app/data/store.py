"""Parquet-on-disk store for OHLCV klines, queried via DuckDB.

Layout: data/parquet/klines/symbol={SYMBOL}/timeframe={TF}/year={YYYY}/data.parquet

DuckDB reads this hive-partitioned structure natively. Polars writes it.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import duckdb
import polars as pl

from app.config import settings
from app.schemas.data import SymbolStatus

KLINE_COLUMNS = [
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_volume",
    "trades",
    "taker_buy_base",
    "taker_buy_quote",
]


def parquet_path(symbol: str, timeframe: str, year: int) -> Path:
    return (
        settings.parquet_dir
        / "klines"
        / f"symbol={symbol}"
        / f"timeframe={timeframe}"
        / f"year={year}"
        / "data.parquet"
    )


def _glob_for(symbol: str | None = None, timeframe: str | None = None) -> str:
    sym = f"symbol={symbol}" if symbol else "symbol=*"
    tf = f"timeframe={timeframe}" if timeframe else "timeframe=*"
    return str(settings.parquet_dir / "klines" / sym / tf / "year=*" / "data.parquet")


def write_klines(df: pl.DataFrame, symbol: str, timeframe: str) -> int:
    """Write a Polars frame of klines, partitioned by year. Idempotent: dedupes on open_time."""
    if df.is_empty():
        return 0

    df = df.with_columns(pl.col("open_time").dt.year().alias("__year"))
    written = 0
    for year_value, group in df.group_by("__year"):
        year = int(year_value[0]) if isinstance(year_value, tuple) else int(year_value)
        path = parquet_path(symbol, timeframe, year)
        path.parent.mkdir(parents=True, exist_ok=True)

        new_part = group.drop("__year")
        if path.exists():
            existing = pl.read_parquet(path)
            combined = pl.concat([existing, new_part], how="diagonal_relaxed")
            combined = combined.unique(subset=["open_time"]).sort("open_time")
        else:
            combined = new_part.sort("open_time")

        combined.write_parquet(path)
        written += combined.height
    return written


def query_klines(
    symbol: str,
    timeframe: str,
    *,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int | None = None,
) -> pl.DataFrame:
    """Read klines in time order. Returns empty frame if nothing on disk."""
    glob = _glob_for(symbol, timeframe)
    if not _glob_has_files(glob):
        return pl.DataFrame()

    where: list[str] = []
    params: list[object] = []
    if start is not None:
        where.append("open_time >= ?")
        params.append(start)
    if end is not None:
        where.append("open_time <= ?")
        params.append(end)
    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    limit_clause = f"LIMIT {int(limit)}" if limit else ""

    sql = f"""
        SELECT *
        FROM read_parquet('{glob}', hive_partitioning=true)
        {where_clause}
        ORDER BY open_time
        {limit_clause}
    """
    con = duckdb.connect(":memory:")
    try:
        rel = con.execute(sql, params)
        return pl.from_arrow(rel.arrow())  # type: ignore[return-value]
    finally:
        con.close()


def list_symbol_status() -> list[SymbolStatus]:
    """Summarize what's on disk: rows + range per (symbol, timeframe)."""
    glob = _glob_for()
    if not _glob_has_files(glob):
        return []

    sql = f"""
        SELECT
            symbol,
            timeframe,
            COUNT(*) AS rows,
            MIN(open_time) AS first_open_time,
            MAX(open_time) AS last_open_time
        FROM read_parquet('{glob}', hive_partitioning=true)
        GROUP BY symbol, timeframe
        ORDER BY symbol, timeframe
    """
    con = duckdb.connect(":memory:")
    try:
        rows = con.execute(sql).fetchall()
    finally:
        con.close()
    return [
        SymbolStatus(
            symbol=str(r[0]),
            timeframe=str(r[1]),
            rows=int(r[2]),
            first_open_time=r[3],
            last_open_time=r[4],
        )
        for r in rows
    ]


def _glob_has_files(glob: str) -> bool:
    # DuckDB throws if glob matches nothing; cheap pre-check via filesystem
    base = Path(glob.split("*")[0])
    if not base.exists():
        return False
    return any(base.rglob("data.parquet"))
