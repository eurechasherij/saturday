import asyncio
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.backtest import (
    create_run,
    get_run,
    list_runs,
    load_equity,
    load_signals,
    load_trades,
    run_backtest,
)
from app.schemas.backtest import BacktestConfig, BacktestRunSummary

router = APIRouter()


@router.get("/runs", response_model=list[BacktestRunSummary])
def get_runs() -> list[BacktestRunSummary]:
    return list_runs()


@router.get("/runs/{run_id}", response_model=BacktestRunSummary)
def get_run_summary(run_id: str) -> BacktestRunSummary:
    s = get_run(run_id)
    if s is None:
        raise HTTPException(status_code=404, detail="run not found")
    return s


@router.get("/runs/{run_id}/trades")
def get_run_trades(run_id: str) -> dict:
    df = load_trades(run_id)
    return {"trades": df.to_dicts() if not df.is_empty() else []}


@router.get("/runs/{run_id}/equity")
def get_run_equity(run_id: str) -> dict:
    df = load_equity(run_id)
    if df.is_empty():
        return {"equity": []}
    rows = []
    for r in df.iter_rows(named=True):
        rows.append({"time": int(r["time"].timestamp()), "equity": float(r["equity"])})
    return {"equity": rows}


@router.get("/runs/{run_id}/signals")
def get_run_signals(run_id: str) -> dict:
    return {"signals": load_signals(run_id)}


@router.post("/runs", response_model=BacktestRunSummary)
def create_run_endpoint(config: BacktestConfig) -> BacktestRunSummary:
    return create_run(config)


@router.get("/runs/{run_id}/stream")
async def stream_run(run_id: str) -> EventSourceResponse:
    """Run the backtest, streaming progress events as SSE."""
    summary = get_run(run_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="run not found")
    if summary.status not in ("pending", "failed"):
        raise HTTPException(
            status_code=409,
            detail=f"run is {summary.status}; create a new run to retry",
        )

    async def event_gen():
        try:
            async for ev in run_backtest(summary):
                yield {"event": ev.get("type", "message"), "data": json.dumps(ev, default=str)}
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_gen())
