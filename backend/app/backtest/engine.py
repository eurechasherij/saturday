"""LLM-in-the-loop backtest engine.

Walks bars in time order. At each closed bar:
  1. Update active patterns (FVG, OB, swings) from the rolling window.
  2. Mark-to-market any open position; close on SL/TP hit.
  3. If trigger conditions fire (price tapped an unmitigated FVG/OB),
     build features → call the (cached) LLM → parse signal.
  4. If signal is actionable and we have no open position, open one.

Sequential by design: LLM decisions can't be vectorized. Speed comes from the
prompt cache and from advancing index pointers (NOT re-filtering DataFrames per bar).
"""

from __future__ import annotations

import asyncio
import logging
import time
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

# Heartbeat: emit progress every N bars even if nothing interesting happened.
HEARTBEAT_BARS = 100
WARMUP_BARS = 60


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
    stage: str = "init"


async def run_backtest(
    summary: BacktestRunSummary,
) -> AsyncIterator[dict[str, Any]]:
    cfg = summary.config
    summary.status = "running"
    update_run(summary)
    log.info("RUN START %s · %s · %s/%s · %s → %s",
             summary.run_id, cfg.symbol, cfg.provider, cfg.model, cfg.start, cfg.end)
    yield {"type": "started", "run_id": summary.run_id, "stage": "loading-data"}

    state: _State | None = None
    try:
        async for ev in _run_inner(summary, cfg):
            yield ev
            if "_state_ref" in ev:
                state = ev["_state_ref"]

    except asyncio.CancelledError:
        # Genuine cancellation: user clicked Cancel, OR process is shutting down,
        # OR an outer task was cancelled. The manager sets summary.error when
        # the cancellation came from the user.
        log.warning("RUN CANCELLED %s — bars=%s triggers=%s",
                    summary.run_id,
                    summary.bars_processed,
                    summary.triggers_fired)
        if summary.status == "running":
            summary.status = "cancelled"
            if not summary.error:
                summary.error = (
                    "task cancelled mid-run — likely backend shutdown or external cancel"
                )
            _finalize_partial(summary, state)
        raise

    except Exception as e:  # noqa: BLE001
        # Real engine exception — DO NOT silently mark as 'cancelled'.
        log.exception("RUN FAILED %s — %s: %s", summary.run_id, type(e).__name__, e)
        if summary.status == "running":
            summary.status = "failed"
            summary.error = f"{type(e).__name__}: {e}"
            _finalize_partial(summary, state)
        # Re-raise so the manager also logs and the SSE/log surface sees it.
        raise

    # Normal completion path: _run_inner sets status='completed' itself.
    log.info("RUN COMPLETED %s — trades=%d return=%s",
             summary.run_id, summary.trades, summary.total_return)


def _finalize_partial(summary: BacktestRunSummary, state: "_State | None") -> None:
    """Persist whatever partial state we have. Called on cancel or failure."""
    summary.finished_at = datetime.utcnow()
    if state is not None:
        summary.triggers_fired = state.triggers_fired
        summary.llm_calls = state.llm_calls
        summary.cache_hits = state.cache_hits
        try:
            trades_df = _trades_to_df(state.trades)
            equity_df = (
                pl.DataFrame(state.equity_points) if state.equity_points else pl.DataFrame()
            )
            save_artifacts(
                summary.run_id, trades=trades_df, equity=equity_df, signals=state.signals
            )
        except Exception:  # noqa: BLE001
            log.exception("failed to persist on finalize")
    update_run(summary)


async def _run_inner(
    summary: BacktestRunSummary,
    cfg: BacktestConfig,
) -> AsyncIterator[dict[str, Any]]:
    """The actual loop. Caller wraps this for cancellation cleanup."""
    candles_per_tf = await _load_data(cfg)
    if not candles_per_tf:
        summary.status = "failed"
        summary.error = "no candles found in store for requested symbol/range"
        update_run(summary)
        yield {"type": "failed", "error": summary.error}
        return

    engine_tf = _pick_engine_tf(candles_per_tf.keys())
    bars = candles_per_tf[engine_tf]
    summary.bars_total = bars.height
    update_run(summary)

    yield {
        "type": "data-loaded",
        "engine_tf": engine_tf,
        "timeframes_loaded": {tf: df.height for tf, df in candles_per_tf.items()},
        "bars_total": bars.height,
        "warmup": WARMUP_BARS,
    }

    if bars.height <= WARMUP_BARS:
        summary.status = "failed"
        summary.error = f"need >{WARMUP_BARS} bars; got {bars.height}"
        update_run(summary)
        yield {"type": "failed", "error": summary.error}
        return

    # Pre-extract time arrays for fast index advancement (NO per-bar filtering!)
    tf_times: dict[str, list[datetime]] = {
        tf: df["open_time"].to_list() for tf, df in candles_per_tf.items()
    }
    tf_indices: dict[str, int] = {tf: 0 for tf in candles_per_tf}

    state = _State(equity=cfg.starting_equity, stage="warmup")
    state.equity_points.append({"time": bars["open_time"][0], "equity": cfg.starting_equity})

    last_emit = 0
    t_loop_start = time.perf_counter()

    # Hand the state up to run_backtest so it can persist partial results on cancel.
    yield {"type": "_state_handoff", "_state_ref": state}
    yield {"type": "loop-start", "stage": "warmup"}

    for i in range(WARMUP_BARS, bars.height):
        bar = bars.row(i, named=True)
        bar_time: datetime = bar["open_time"]
        high, low, close = float(bar["high"]), float(bar["low"]), float(bar["close"])

        # ---- 1. Resolve any open position first (intra-bar) ----
        if state.open_pos is not None:
            _try_resolve(state, bar_time, high, low)

        # ---- 2. Advance per-TF index pointers (O(1) amortized) ----
        rolling: dict[str, pl.DataFrame] = {}
        for tf in candles_per_tf:
            times = tf_times[tf]
            idx = tf_indices[tf]
            while idx < len(times) and times[idx] <= bar_time:
                idx += 1
            tf_indices[tf] = idx
            if idx > 0:
                rolling[tf] = candles_per_tf[tf].head(idx)

        # ---- 3. Trigger detection ----
        state.stage = "trigger-check"
        engine_rolling = rolling.get(engine_tf)
        if engine_rolling is None or engine_rolling.height < 50:
            triggered, reason = False, "warming-up"
        elif cfg.use_trigger:
            triggered, reason = _check_trigger(engine_rolling, close, cfg.trigger_proximity_pct)
        else:
            triggered, reason = True, "every-bar"

        if triggered and state.open_pos is None:
            state.triggers_fired += 1
            state.stage = "feature-build"
            try:
                features = build_features(cfg.symbol, rolling)
            except ValueError as e:
                log.debug("feature build skipped: %s", e)
                features = None

            if features is not None:
                state.stage = "llm-call"
                yield {
                    "type": "llm-start",
                    "bar_time": bar_time.isoformat(),
                    "trigger": reason,
                    "bars_processed": i - WARMUP_BARS + 1,
                    "bars_total": summary.bars_total,
                    "triggers": state.triggers_fired,
                    "llm_calls": state.llm_calls,
                    "cache_hits": state.cache_hits,
                }
                try:
                    signal, cache_hit = await generate_signal(
                        features,
                        provider=cfg.provider,
                        model=cfg.model,
                        timestamp=bar_time,
                        timeframes=cfg.timeframes,
                        use_cache=True,
                    )
                except Exception as e:  # noqa: BLE001
                    log.exception("signal generation failed at %s", bar_time)
                    yield {
                        "type": "warning",
                        "bar_time": bar_time.isoformat(),
                        "message": f"signal generation failed: {e}",
                    }
                    signal = None
                    cache_hit = False

                if signal is not None:
                    state.llm_calls += 0 if cache_hit else 1
                    state.cache_hits += 1 if cache_hit else 0

                    will_open = (
                        signal.actionable
                        and signal.confidence >= cfg.confidence_threshold
                        and signal.direction in ("LONG", "SHORT")
                    )
                    rejection_reason = ""
                    if signal.direction == "NONE":
                        rejection_reason = "direction=NONE"
                    elif not signal.actionable:
                        rejection_reason = "non-positive entry/SL/TP"
                    elif signal.confidence < cfg.confidence_threshold:
                        rejection_reason = f"confidence {signal.confidence} < threshold {cfg.confidence_threshold}"

                    state.signals.append(
                        {
                            "id": signal.prompt_hash[:12],
                            "time": bar_time.isoformat(),
                            "trigger_reason": reason,
                            "direction": signal.direction,
                            "entry": signal.entry,
                            "stop_loss": signal.stop_loss,
                            "take_profit": signal.take_profit,
                            "risk_reward": signal.risk_reward,
                            "confidence": signal.confidence,
                            "thoughts": signal.thoughts,
                            "features_used": signal.features_used,
                            "cache_hit": cache_hit,
                            "position_opened": will_open,
                            "rejection_reason": rejection_reason,
                        }
                    )

                    yield {
                        "type": "progress",
                        "stage": "after-llm",
                        "bars_processed": i - WARMUP_BARS + 1,
                        "bars_total": summary.bars_total,
                        "triggers": state.triggers_fired,
                        "llm_calls": state.llm_calls,
                        "cache_hits": state.cache_hits,
                        "equity": state.equity,
                        "open_pos": state.open_pos is not None,
                        "elapsed_s": round(time.perf_counter() - t_loop_start, 1),
                        "last_signal": {
                            "time": bar_time.isoformat(),
                            "direction": signal.direction,
                            "confidence": signal.confidence,
                            "trigger": reason,
                            "cache_hit": cache_hit,
                        },
                    }
                    last_emit = i

                    if will_open:
                        notional = state.equity * cfg.position_pct
                        state.open_pos = _OpenPosition(
                            direction=signal.direction,
                            entry_time=bar_time,
                            entry_price=close,
                            stop_loss=signal.stop_loss,
                            take_profit=signal.take_profit,
                            notional=notional,
                            leverage=cfg.leverage,
                            confidence=signal.confidence,
                            signal_id=signal.prompt_hash[:12],
                            entry_equity=state.equity,
                        )

        state.stage = "mark-equity"
        state.equity_points.append({"time": bar_time, "equity": state.equity})
        summary.bars_processed = i - WARMUP_BARS + 1

        # Heartbeat tick — keeps the UI alive when no LLM is firing.
        if (i - last_emit) >= HEARTBEAT_BARS:
            last_emit = i
            summary.triggers_fired = state.triggers_fired
            summary.llm_calls = state.llm_calls
            summary.cache_hits = state.cache_hits
            update_run(summary)
            elapsed = time.perf_counter() - t_loop_start
            bars_per_s = (i - WARMUP_BARS + 1) / elapsed if elapsed > 0 else 0
            yield {
                "type": "progress",
                "stage": "heartbeat",
                "bars_processed": i - WARMUP_BARS + 1,
                "bars_total": summary.bars_total,
                "triggers": state.triggers_fired,
                "llm_calls": state.llm_calls,
                "cache_hits": state.cache_hits,
                "equity": state.equity,
                "open_pos": state.open_pos is not None,
                "elapsed_s": round(elapsed, 1),
                "bars_per_s": round(bars_per_s, 1),
                "current_time": bar_time.isoformat(),
                "current_price": close,
            }

    # ---- Force-close any still-open position at the last bar ----
    if state.open_pos is not None:
        last = bars.row(bars.height - 1, named=True)
        _force_close(state, last["open_time"], float(last["close"]))

    # ---- Persist artifacts + summary ----
    state.stage = "finalize"
    yield {"type": "progress", "stage": "finalize", "bars_processed": summary.bars_total, "bars_total": summary.bars_total}

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
    if df.height < 50:
        return False, "warming-up"

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
            symbol="",
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


_ = uuid
