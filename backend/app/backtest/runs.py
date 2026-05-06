"""Backtest run persistence — directory-per-run with config + parquet artifacts."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

import polars as pl

from app.config import settings
from app.schemas.backtest import BacktestConfig, BacktestRunSummary


def _run_dir(run_id: str) -> Path:
    return settings.backtests_dir / run_id


def create_run(config: BacktestConfig) -> BacktestRunSummary:
    run_id = uuid.uuid4().hex[:12]
    rd = _run_dir(run_id)
    rd.mkdir(parents=True, exist_ok=True)
    summary = BacktestRunSummary(
        run_id=run_id,
        status="pending",
        config=config,
        started_at=datetime.utcnow(),
    )
    _save_summary(summary)
    return summary


def update_run(summary: BacktestRunSummary) -> None:
    _save_summary(summary)


def get_run(run_id: str) -> BacktestRunSummary | None:
    p = _run_dir(run_id) / "summary.json"
    if not p.exists():
        return None
    return BacktestRunSummary.model_validate_json(p.read_text())


def list_runs() -> list[BacktestRunSummary]:
    out: list[BacktestRunSummary] = []
    if not settings.backtests_dir.exists():
        return out
    for d in settings.backtests_dir.iterdir():
        if not d.is_dir():
            continue
        sp = d / "summary.json"
        if sp.exists():
            try:
                out.append(BacktestRunSummary.model_validate_json(sp.read_text()))
            except Exception:
                continue
    # Newest first by started_at — run_ids are random UUIDs and don't sort chronologically.
    out.sort(key=lambda s: s.started_at, reverse=True)
    return out


def _save_summary(summary: BacktestRunSummary) -> None:
    p = _run_dir(summary.run_id) / "summary.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(summary.model_dump_json(indent=2))


def save_artifacts(
    run_id: str,
    *,
    trades: pl.DataFrame | None = None,
    equity: pl.DataFrame | None = None,
    signals: list[dict] | None = None,
) -> None:
    rd = _run_dir(run_id)
    if trades is not None and not trades.is_empty():
        trades.write_parquet(rd / "trades.parquet")
    if equity is not None and not equity.is_empty():
        equity.write_parquet(rd / "equity.parquet")
    if signals is not None:
        (rd / "signals.json").write_text(json.dumps(signals, default=str, indent=2))


def load_trades(run_id: str) -> pl.DataFrame:
    p = _run_dir(run_id) / "trades.parquet"
    return pl.read_parquet(p) if p.exists() else pl.DataFrame()


def load_equity(run_id: str) -> pl.DataFrame:
    p = _run_dir(run_id) / "equity.parquet"
    return pl.read_parquet(p) if p.exists() else pl.DataFrame()


def load_signals(run_id: str) -> list[dict]:
    p = _run_dir(run_id) / "signals.json"
    if not p.exists():
        return []
    return json.loads(p.read_text())
