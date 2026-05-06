"""Indicators computed via the `ta` library, attached as columns on a Polars frame.

Adds: rsi_14, macd, macd_signal, macd_hist, atr_14, obv.

We bridge Polars ↔ pandas only for the indicator pass; the rest of the codebase
stays in Polars. `ta` is pure-Python, no native deps, works under numpy 2.x.
"""

from __future__ import annotations

import pandas as pd
import polars as pl
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import AverageTrueRange
from ta.volume import OnBalanceVolumeIndicator


_INDICATOR_COLS = ("rsi_14", "macd", "macd_signal", "macd_hist", "atr_14", "obv")

# Slow MACD needs 26 closes; with the 9-period signal, 35 is the smallest size
# where every column gets at least one real value. Below that, the `ta` library
# raises IndexError instead of falling back gracefully.
MIN_BARS_FOR_INDICATORS = 35


def add_indicators(df: pl.DataFrame) -> pl.DataFrame:
    """Attach indicator columns. If the frame is too short, columns are null-filled."""
    if df.is_empty():
        return df

    if df.height < MIN_BARS_FOR_INDICATORS:
        return df.with_columns(
            *[pl.lit(None, dtype=pl.Float64).alias(c) for c in _INDICATOR_COLS]
        )

    pdf = df.to_pandas()
    high: pd.Series = pdf["high"]
    low: pd.Series = pdf["low"]
    close: pd.Series = pdf["close"]
    volume: pd.Series = pdf["volume"]

    rsi = RSIIndicator(close=close, window=14, fillna=False).rsi()
    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9, fillna=False)
    atr = AverageTrueRange(high=high, low=low, close=close, window=14, fillna=False).average_true_range()
    obv = OnBalanceVolumeIndicator(close=close, volume=volume, fillna=False).on_balance_volume()

    return df.with_columns(
        pl.Series("rsi_14", rsi.tolist(), dtype=pl.Float64),
        pl.Series("macd", macd.macd().tolist(), dtype=pl.Float64),
        pl.Series("macd_signal", macd.macd_signal().tolist(), dtype=pl.Float64),
        pl.Series("macd_hist", macd.macd_diff().tolist(), dtype=pl.Float64),
        pl.Series("atr_14", atr.tolist(), dtype=pl.Float64),
        pl.Series("obv", obv.tolist(), dtype=pl.Float64),
    )
