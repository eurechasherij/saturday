from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import settings
from app.data import (
    fetch_recent_klines,
    ingest_range,
    list_symbol_status,
    query_klines,
)
from app.schemas.data import IngestRequest, SymbolStatus

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


@router.post("/ingest")
def ingest(req: IngestRequest, bg: BackgroundTasks) -> dict[str, str]:
    """Schedule a Binance Vision bulk ingest in the background.

    The frontend should poll /symbols to see progress.
    """
    def _run() -> None:
        try:
            ingest_range(req.symbol, req.timeframe, start=req.start, end=req.end)
        except Exception as e:  # noqa: BLE001
            # Background task failures are logged by FastAPI's default handler;
            # surface in /symbols when row counts don't increase.
            import logging
            logging.getLogger(__name__).exception("ingest failed: %s", e)

    bg.add_task(_run)
    return {"status": "scheduled", "symbol": req.symbol, "timeframe": req.timeframe}


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

    # convert to list of small dicts for the frontend chart
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
