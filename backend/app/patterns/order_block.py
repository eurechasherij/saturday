"""ICT-style Order Block detection.

Bullish OB: the last *down* candle before a displacement up-move that takes out
            a prior swing high. The OB is the body (or full range) of that down candle.
Bearish OB: the last *up* candle before a displacement down-move that takes out
            a prior swing low.

We use a simple displacement test: a move covering >= `displacement_atr` * ATR within
`displacement_window` bars after the candle.

This is a pragmatic approximation of the ICT concept — refine the parameters as
your strategy matures.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import polars as pl

from app.patterns.swings import SwingPoint, detect_swings


@dataclass
class OrderBlock:
    type: Literal["bullish", "bearish"]
    top: float
    bottom: float
    formed_at: datetime
    formed_index: int
    mitigated: bool = False
    mitigated_at: datetime | None = None

    def contains(self, price: float) -> bool:
        return self.bottom <= price <= self.top

    def mid(self) -> float:
        return (self.top + self.bottom) / 2


def detect_order_blocks(
    df: pl.DataFrame,
    *,
    swing_lookback: int = 2,
    displacement_atr_mult: float = 1.5,
    displacement_window: int = 5,
) -> list[OrderBlock]:
    if df.height < swing_lookback * 2 + displacement_window + 2:
        return []

    high = df["high"].to_list()
    low = df["low"].to_list()
    open_ = df["open"].to_list()
    close = df["close"].to_list()
    times = df["open_time"].to_list()
    atr = (
        df["atr_14"].to_list()
        if "atr_14" in df.columns
        else [None] * df.height
    )
    n = len(high)
    swings = detect_swings(df, lookback=swing_lookback)

    obs: list[OrderBlock] = []
    for i in range(1, n - displacement_window):
        ref_atr = atr[i] if atr[i] is not None else _fallback_atr(high, low, close, i)
        if ref_atr is None or ref_atr <= 0:
            continue

        # Bullish OB: candle i is a down candle, then within window we move >= mult*ATR
        # AND we take out a prior swing high.
        is_down = close[i] < open_[i]
        is_up = close[i] > open_[i]

        window_high = max(high[i + 1 : i + 1 + displacement_window])
        window_low = min(low[i + 1 : i + 1 + displacement_window])

        if is_down and (window_high - close[i]) >= displacement_atr_mult * ref_atr:
            # find the most recent swing high before i
            prior_swing_highs = [s for s in swings if s.type == "high" and s.index < i]
            if prior_swing_highs and window_high > prior_swing_highs[-1].price:
                obs.append(
                    OrderBlock(
                        type="bullish",
                        top=max(open_[i], close[i], high[i]),
                        bottom=min(open_[i], close[i], low[i]),
                        formed_at=times[i],
                        formed_index=i,
                    )
                )
                continue

        if is_up and (close[i] - window_low) >= displacement_atr_mult * ref_atr:
            prior_swing_lows = [s for s in swings if s.type == "low" and s.index < i]
            if prior_swing_lows and window_low < prior_swing_lows[-1].price:
                obs.append(
                    OrderBlock(
                        type="bearish",
                        top=max(open_[i], close[i], high[i]),
                        bottom=min(open_[i], close[i], low[i]),
                        formed_at=times[i],
                        formed_index=i,
                    )
                )

    # mitigation
    for ob in obs:
        for j in range(ob.formed_index + 1, n):
            if ob.type == "bullish" and low[j] <= ob.top:
                # only mark mitigated once price dips back into the OB body
                ob.mitigated = True
                ob.mitigated_at = times[j]
                break
            if ob.type == "bearish" and high[j] >= ob.bottom:
                ob.mitigated = True
                ob.mitigated_at = times[j]
                break

    # collapse: keep last 50 unmitigated by recency to avoid prompt explosion
    return obs


def _fallback_atr(high: list[float], low: list[float], close: list[float], i: int) -> float | None:
    if i < 14:
        return None
    trs = []
    for k in range(i - 13, i + 1):
        if k == 0:
            trs.append(high[k] - low[k])
        else:
            trs.append(
                max(
                    high[k] - low[k],
                    abs(high[k] - close[k - 1]),
                    abs(low[k] - close[k - 1]),
                )
            )
    return sum(trs) / len(trs)


# expose SwingPoint for re-export consumers
_ = SwingPoint
