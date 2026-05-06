"""Aggregate metrics from a closed backtest's trades + equity curve."""

from __future__ import annotations

import math

import polars as pl


def compute_metrics(trades: pl.DataFrame, equity: pl.DataFrame) -> dict[str, float | int | None]:
    if trades.is_empty():
        return {
            "trades": 0,
            "win_rate": None,
            "profit_factor": None,
            "total_return": None,
            "max_drawdown": None,
            "sharpe": None,
            "final_equity": float(equity["equity"][-1]) if not equity.is_empty() else None,
        }

    closed = trades.filter(pl.col("exit_reason") != "OPEN")
    n = closed.height
    wins = closed.filter(pl.col("pnl") > 0).height
    losses = closed.filter(pl.col("pnl") < 0).height
    win_rate = wins / n if n else None

    gross_win = float(closed.filter(pl.col("pnl") > 0)["pnl"].sum() or 0)
    gross_loss = abs(float(closed.filter(pl.col("pnl") < 0)["pnl"].sum() or 0))
    profit_factor = (gross_win / gross_loss) if gross_loss > 0 else None

    tp_count = closed.filter(pl.col("exit_reason") == "TP").height
    sl_count = closed.filter(pl.col("exit_reason") == "SL").height
    timeout_count = closed.filter(pl.col("exit_reason") == "TIMEOUT").height
    avg_win = (gross_win / wins) if wins > 0 else None
    avg_loss = (gross_loss / losses) if losses > 0 else None

    if equity.is_empty():
        return {
            "trades": n,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "total_return": None,
            "max_drawdown": None,
            "sharpe": None,
            "final_equity": None,
            "tp_count": tp_count,
            "sl_count": sl_count,
            "timeout_count": timeout_count,
            "avg_win": avg_win,
            "avg_loss": avg_loss,
        }

    eq = equity.sort("time")
    e0 = float(eq["equity"][0])
    eN = float(eq["equity"][-1])
    total_return = (eN - e0) / e0 if e0 > 0 else None

    # Max drawdown over the equity curve
    eq = eq.with_columns(pl.col("equity").cum_max().alias("__peak"))
    eq = eq.with_columns(((pl.col("equity") - pl.col("__peak")) / pl.col("__peak")).alias("__dd"))
    max_dd = float(eq["__dd"].min() or 0)

    # Sharpe from per-trade returns (simple, daily-equivalent annualization skipped — hobby)
    rets = closed["pnl_pct"].drop_nulls().to_list()
    sharpe = None
    if len(rets) > 1:
        mu = sum(rets) / len(rets)
        var = sum((r - mu) ** 2 for r in rets) / (len(rets) - 1)
        sd = math.sqrt(var) if var > 0 else 0.0
        sharpe = (mu / sd) if sd > 0 else None

    return {
        "trades": n,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "total_return": total_return,
        "max_drawdown": max_dd,
        "sharpe": sharpe,
        "final_equity": eN,
        "tp_count": tp_count,
        "sl_count": sl_count,
        "timeout_count": timeout_count,
        "avg_win": avg_win,
        "avg_loss": avg_loss,
    }
