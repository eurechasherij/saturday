"""ICT-style Fair Value Gap detection.

Bullish FVG: candle[i-2].high < candle[i].low  → gap zone is (candle[i-2].high, candle[i].low)
Bearish FVG: candle[i-2].low  > candle[i].high → gap zone is (candle[i].high,  candle[i-2].low)

A gap is "mitigated" once a later candle's wick trades back into the zone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import polars as pl


@dataclass
class FVG:
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


def detect_fvgs(df: pl.DataFrame) -> list[FVG]:
    """Walk the frame once, emit all FVGs, mark mitigation status as of the last bar."""
    if df.height < 3:
        return []

    high = df["high"].to_list()
    low = df["low"].to_list()
    times = df["open_time"].to_list()
    n = len(high)

    fvgs: list[FVG] = []
    for i in range(2, n):
        if high[i - 2] < low[i]:
            fvgs.append(
                FVG(
                    type="bullish",
                    top=low[i],
                    bottom=high[i - 2],
                    formed_at=times[i],
                    formed_index=i,
                )
            )
        elif low[i - 2] > high[i]:
            fvgs.append(
                FVG(
                    type="bearish",
                    top=low[i - 2],
                    bottom=high[i],
                    formed_at=times[i],
                    formed_index=i,
                )
            )

    # mitigation pass
    for fvg in fvgs:
        for j in range(fvg.formed_index + 1, n):
            if fvg.type == "bullish" and low[j] <= fvg.top:
                fvg.mitigated = True
                fvg.mitigated_at = times[j]
                break
            if fvg.type == "bearish" and high[j] >= fvg.bottom:
                fvg.mitigated = True
                fvg.mitigated_at = times[j]
                break

    return fvgs
