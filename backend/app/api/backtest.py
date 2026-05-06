from fastapi import APIRouter, HTTPException

from app.backtest import (
    create_run,
    get_run,
    list_runs,
    load_equity,
    load_signals,
    load_trades,
    manager,
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


@router.get("/runs/{run_id}/log")
def get_run_log(run_id: str, since: int = 0) -> dict:
    """Pull recent engine events. Frontend polls this for live progress.
    `since` is the cursor returned from the previous call.
    """
    if get_run(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    events, cursor = manager.get_log(run_id, since=since)
    return {
        "events": events,
        "cursor": cursor,
        "running": manager.is_running(run_id),
    }


@router.post("/runs", response_model=BacktestRunSummary)
async def create_and_start_run(config: BacktestConfig) -> BacktestRunSummary:
    """Create the run record AND start it as a background task.

    Must be `async def` — manager.start() calls asyncio.create_task(), which
    requires a running event loop. FastAPI runs sync handlers in a threadpool
    with no loop attached.
    """
    summary = create_run(config)
    manager.start(summary)
    return summary


@router.delete("/runs/{run_id}")
async def cancel_run(run_id: str) -> dict[str, bool | str]:
    summary = get_run(run_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="run not found")
    if not manager.is_running(run_id):
        return {"cancelled": False, "reason": "not running"}
    manager.cancel(run_id)
    return {"cancelled": True, "reason": "cancellation signal sent"}
