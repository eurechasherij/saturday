"""Fractal swing-point detection.

A high at index i is a swing high if it's strictly greater than the highs of the
N bars on each side. Symmetric for swing lows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import polars as pl


@dataclass
class SwingPoint:
    type: Literal["high", "low"]
    price: float
    time: datetime
    index: int


def detect_swings(df: pl.DataFrame, *, lookback: int = 2) -> list[SwingPoint]:
    if df.height < 2 * lookback + 1:
        return []
    high = df["high"].to_list()
    low = df["low"].to_list()
    times = df["open_time"].to_list()
    n = len(high)
    out: list[SwingPoint] = []
    for i in range(lookback, n - lookback):
        h = high[i]
        if all(h > high[i - k] for k in range(1, lookback + 1)) and all(
            h > high[i + k] for k in range(1, lookback + 1)
        ):
            out.append(SwingPoint(type="high", price=h, time=times[i], index=i))
            continue
        ll = low[i]
        if all(ll < low[i - k] for k in range(1, lookback + 1)) and all(
            ll < low[i + k] for k in range(1, lookback + 1)
        ):
            out.append(SwingPoint(type="low", price=ll, time=times[i], index=i))
    return out
