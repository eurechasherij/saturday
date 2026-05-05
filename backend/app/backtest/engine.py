"""LLM-in-the-loop backtest engine.

Walks bars in time order. At each closed bar:
  1. Update active patterns (FVG, OB, swings) from the rolling window.
  2. Mark-to-market any open position; close on SL/TP hit.
  3. If trigger conditions fire (price tapped an unmitigated FVG/OB),
     build features → call the (cached) LLM → parse signal.
  4. If signal is actionable and we have no open position, open one.

Sequential by design: LLM decisions can't be vectorized. Speed comes from the
prompt cache — re-runs after the first pass make zero LLM calls.

Yields progress events for SSE streaming.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import polars as pl

from app.backtest.metrics import compute_metrics
from app.backtest.runs import save_artifacts, update_run
from app.data import query_klines
from app.patterns.features import build_features
from app.patterns.fvg import detect_fvgs
from app.patterns.order_block import detect_order_blocks
from app.schemas.backtest import BacktestConfig, BacktestRunSummary, Trade
from app.signals.pipeline import generate_signal

log = logging.getLogger(__name__)


@dataclass
class _OpenPosition:
    direction: str
    entry_time: datetime
    entry_price: float
    stop_loss: float
    take_profit: float
    notional: float
    leverage: int
    confidence: int
    signal_id: str
    entry_equity: float


@dataclass
class _State:
    equity: float
    open_pos: _OpenPosition | None = None
    trades: list[Trade] = field(default_factory=list)
    equity_points: list[dict[str, Any]] = field(default_factory=list)
    signals: list[dict[str, Any]] = field(default_factory=list)
    triggers_fired: int = 0
    llm_calls: int = 0
    cache_hits: int = 0


async def run_backtest(
    summary: BacktestRunSummary,
) -> AsyncIterator[dict[str, Any]]:
    cfg = summary.config
    summary.status = "running"
    update_run(summary)
    yield {"type": "started", "run_id": summary.run_id}

    # 1. Load data for all timeframes.
    candles_per_tf = await _load_data(cfg)
    if not candles_per_tf:
        summary.status = "failed"
        summary.error = "no candles found in store for requested symbol/range"
        update_run(summary)
        yield {"type": "failed", "error": summary.error}
        return

    # The "engine timeframe" = highest-resolution loaded TF (drives the bar loop).
    engine_tf = _pick_engine_tf(candles_per_tf.keys())
    bars = candles_per_tf[engine_tf]
    summary.bars_total = bars.height
    update_run(summary)

    state = _State(equity=cfg.starting_equity)
    state.equity_points.append({"time": bars["open_time"][0], "equity": cfg.starting_equity})

    # Warm-up: need enough bars for indicators + pattern detection.
    warmup = 60
    if bars.height <= warmup:
        summary.status = "failed"
        summary.error = f"need >{warmup} bars; got {bars.height}"
        update_run(summary)
        yield {"type": "failed", "error": summary.error}
        return

    last_tick = 0
    for i in range(warmup, bars.height):
        bar = bars.row(i, named=True)
        bar_time: datetime = bar["open_time"]
        high, low, close = float(bar["high"]), float(bar["low"]), float(bar["close"])

        # 2. Resolve any open position first (intra-bar)
        if state.open_pos is not None:
            _try_resolve(state, bar_time, high, low)

        # 3. Trigger detection — only on the engine TF
        rolling = {tf: df.filter(pl.col("open_time") <= bar_time) for tf, df in candles_per_tf.items()}
        triggered, reason = _check_trigger(rolling[engine_tf], close, cfg.trigger_proximity_pct) if cfg.use_trigger else (True, "every-bar")

        if triggered and state.open_pos is None:
            state.triggers_fired += 1
            try:
                features = build_features(cfg.symbol, rolling)
            except ValueError as e:
                log.debug("feature build skipped: %s", e)
                features = None

            if features is not None:
                signal, cache_hit = await generate_signal(
                    features,
                    provider=cfg.provider,
                    model=cfg.model,
                    timestamp=bar_time,
                    timeframes=cfg.timeframes,
                    use_cache=True,
                )
                state.llm_calls += 0 if cache_hit else 1
                state.cache_hits += 1 if cache_hit else 0

                state.signals.append(
                    {
                        "id": signal.prompt_hash[:12],
                        "time": bar_time.isoformat(),
                        "trigger_reason": reason,
                        "direction": signal.direction,
                        "entry": signal.entry,
                        "stop_loss": signal.stop_loss,
                        "take_profit": signal.take_profit,
                        "confidence": signal.confidence,
                        "thoughts": signal.thoughts,
                        "features_used": signal.features_used,
                        "cache_hit": cache_hit,
                    }
                )

                if (
                    signal.actionable
                    and signal.confidence >= cfg.confidence_threshold
                    and signal.direction in ("LONG", "SHORT")
                ):
                    notional = state.equity * cfg.position_pct
                    state.open_pos = _OpenPosition(
                        direction=signal.direction,
                        entry_time=bar_time,
                        entry_price=close,  # market fill at the close of trigger bar
                        stop_loss=signal.stop_loss,
                        take_profit=signal.take_profit,
                        notional=notional,
                        leverage=cfg.leverage,
                        confidence=signal.confidence,
                        signal_id=signal.prompt_hash[:12],
                        entry_equity=state.equity,
                    )

        # 4. Mark equity (mark-to-market open position would go here if we tracked it bar-by-bar)
        state.equity_points.append({"time": bar_time, "equity": state.equity})
        summary.bars_processed = i - warmup + 1

        # progress every 200 bars
        if (i - last_tick) >= 200:
            last_tick = i
            summary.triggers_fired = state.triggers_fired
            summary.llm_calls = state.llm_calls
            summary.cache_hits = state.cache_hits
            update_run(summary)
            yield {
                "type": "progress",
                "bars_processed": summary.bars_processed,
                "bars_total": summary.bars_total,
                "triggers": state.triggers_fired,
                "llm_calls": state.llm_calls,
                "cache_hits": state.cache_hits,
                "equity": state.equity,
            }

    # 5. Force-close any still-open position at the last bar
    if state.open_pos is not None:
        last = bars.row(bars.height - 1, named=True)
        _force_close(state, last["open_time"], float(last["close"]))

    # 6. Persist artifacts + summary
    trades_df = _trades_to_df(state.trades)
    equity_df = pl.DataFrame(state.equity_points)
    save_artifacts(summary.run_id, trades=trades_df, equity=equity_df, signals=state.signals)

    metrics = compute_metrics(trades_df, equity_df)
    summary.status = "completed"
    summary.finished_at = datetime.utcnow()
    summary.trades = int(metrics.get("trades") or 0)
    summary.win_rate = metrics.get("win_rate")  # type: ignore[assignment]
    summary.profit_factor = metrics.get("profit_factor")  # type: ignore[assignment]
    summary.total_return = metrics.get("total_return")  # type: ignore[assignment]
    summary.max_drawdown = metrics.get("max_drawdown")  # type: ignore[assignment]
    summary.sharpe = metrics.get("sharpe")  # type: ignore[assignment]
    summary.final_equity = metrics.get("final_equity")  # type: ignore[assignment]
    summary.triggers_fired = state.triggers_fired
    summary.llm_calls = state.llm_calls
    summary.cache_hits = state.cache_hits
    update_run(summary)

    yield {"type": "completed", "summary": summary.model_dump(mode="json")}


# ---------- helpers ----------


async def _load_data(cfg: BacktestConfig) -> dict[str, pl.DataFrame]:
    out: dict[str, pl.DataFrame] = {}
    for tf in cfg.timeframes:
        df = query_klines(cfg.symbol, tf, start=cfg.start, end=cfg.end)
        if not df.is_empty():
            out[tf] = df
    return out


def _pick_engine_tf(tfs) -> str:
    order = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d"]
    have = list(tfs)
    have.sort(key=lambda t: order.index(t) if t in order else 999)
    return have[0]


def _check_trigger(
    df: pl.DataFrame,
    current_price: float,
    proximity_pct: float,
) -> tuple[bool, str]:
    """Did the last bar tap an unmitigated FVG or OB?"""
    if df.height < 50:
        return False, "warming-up"

    # Cheap window — last 200 bars is enough for active zones.
    window = df.tail(200)
    fvgs = [f for f in detect_fvgs(window) if not f.mitigated]
    obs = [o for o in detect_order_blocks(window) if not o.mitigated]

    band = current_price * proximity_pct
    for f in fvgs:
        if abs(current_price - f.top) <= band or abs(current_price - f.bottom) <= band or f.contains(current_price):
            return True, f"fvg_{f.type}"
    for o in obs:
        if abs(current_price - o.top) <= band or abs(current_price - o.bottom) <= band or o.contains(current_price):
            return True, f"ob_{o.type}"
    return False, "no-zone-tap"


def _try_resolve(state: _State, bar_time: datetime, high: float, low: float) -> None:
    pos = state.open_pos
    assert pos is not None

    hit_tp = (pos.direction == "LONG" and high >= pos.take_profit) or (
        pos.direction == "SHORT" and low <= pos.take_profit
    )
    hit_sl = (pos.direction == "LONG" and low <= pos.stop_loss) or (
        pos.direction == "SHORT" and high >= pos.stop_loss
    )

    # Pessimistic ordering: assume SL hits first if both within the same bar
    if hit_sl:
        _close(state, bar_time, pos.stop_loss, "SL")
    elif hit_tp:
        _close(state, bar_time, pos.take_profit, "TP")


def _close(state: _State, t: datetime, exit_price: float, reason: str) -> None:
    pos = state.open_pos
    assert pos is not None
    qty = (pos.notional * pos.leverage) / pos.entry_price if pos.entry_price > 0 else 0.0
    if pos.direction == "LONG":
        pnl = (exit_price - pos.entry_price) * qty
    else:
        pnl = (pos.entry_price - exit_price) * qty
    state.equity += pnl
    pnl_pct = pnl / pos.entry_equity if pos.entry_equity > 0 else 0.0

    state.trades.append(
        Trade(
            symbol="",  # filled in df-conversion below if needed
            direction=pos.direction,  # type: ignore[arg-type]
            entry_time=pos.entry_time,
            entry_price=pos.entry_price,
            exit_time=t,
            exit_price=exit_price,
            exit_reason=reason,  # type: ignore[arg-type]
            notional=pos.notional,
            leverage=pos.leverage,
            stop_loss=pos.stop_loss,
            take_profit=pos.take_profit,
            confidence=pos.confidence,
            pnl=pnl,
            pnl_pct=pnl_pct,
            signal_id=pos.signal_id,
        )
    )
    state.open_pos = None


def _force_close(state: _State, t: datetime, last_close: float) -> None:
    _close(state, t, last_close, "TIMEOUT")


def _trades_to_df(trades: list[Trade]) -> pl.DataFrame:
    if not trades:
        return pl.DataFrame()
    return pl.DataFrame([t.model_dump() for t in trades])


# placate unused-import linters
_ = uuid
