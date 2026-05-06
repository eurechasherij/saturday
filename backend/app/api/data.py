import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.data import (
    fetch_recent_klines,
    ingest_range_stream,
    list_symbol_status,
    query_klines,
)
from app.schemas.data import SymbolStatus

router = APIRouter()


@router.get("/symbols", response_model=list[SymbolStatus])
def get_symbol_status() -> list[SymbolStatus]:
    return list_symbol_status()


@router.get("/defaults")
def get_defaults() -> dict[str, list[str]]:
    return {
        "symbols": settings.default_symbols,
        "timeframes": ["5m", "15m", "1h", "4h", "1d"],
    }


@router.get("/ingest/stream")
async def ingest_stream(
    symbol: str,
    timeframe: str = "1h",
    start: str = "",
    end: str | None = None,
) -> EventSourceResponse:
    """Stream a Binance Vision ingest, one event per month.

    Frontend opens an EventSource on this URL. Closing the EventSource
    cancels the ingest mid-flight; data already written is preserved.
    """
    if not start:
        raise HTTPException(status_code=400, detail="`start` is required (YYYY-MM)")

    async def event_gen():
        try:
            async for ev in ingest_range_stream(
                symbol, timeframe, start=start, end=end or None
            ):
                yield {"event": ev["type"], "data": json.dumps(ev, default=str)}
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_gen())


@router.post("/refresh/{symbol}/{timeframe}")
async def refresh_recent(symbol: str, timeframe: str) -> dict[str, int | str]:
    """Pull last 500 bars from REST API and merge into the store."""
    try:
        rows = await fetch_recent_klines(symbol, timeframe)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"symbol": symbol, "timeframe": timeframe, "rows_merged": rows}


@router.get("/klines/{symbol}/{timeframe}")
def get_klines(
    symbol: str,
    timeframe: str,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 500,
) -> dict:
    df = query_klines(symbol, timeframe, start=start, end=end, limit=limit)
    if df.is_empty():
        return {"symbol": symbol, "timeframe": timeframe, "candles": []}

    rows = []
    for r in df.tail(limit).iter_rows(named=True):
        rows.append(
            {
                "time": int(r["open_time"].timestamp()),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["volume"]),
            }
        )
    return {"symbol": symbol, "timeframe": timeframe, "candles": rows}
