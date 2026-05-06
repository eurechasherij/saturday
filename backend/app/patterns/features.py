"""Bundle the per-timeframe features the LLM will see at a single evaluation point."""

from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from app.patterns.fvg import FVG, detect_fvgs
from app.patterns.indicators import add_indicators
from app.patterns.order_block import OrderBlock, detect_order_blocks
from app.patterns.swings import SwingPoint, detect_swings


@dataclass
class TimeframeFeatures:
    timeframe: str
    candles: pl.DataFrame  # last N enriched bars
    fvgs: list[FVG] = field(default_factory=list)
    order_blocks: list[OrderBlock] = field(default_factory=list)
    swings: list[SwingPoint] = field(default_factory=list)


@dataclass
class FeatureBundle:
    symbol: str
    current_price: float
    per_timeframe: dict[str, TimeframeFeatures]


def build_features(
    symbol: str,
    candles_per_tf: dict[str, pl.DataFrame],
    *,
    last_n_for_prompt: int = 30,
    nearby_zone_pct: float = 0.05,
) -> FeatureBundle:
    """Compute indicators + patterns on each timeframe and tail the candles for the prompt.

    Only **active (unmitigated)** zones near current price are kept in the bundle.
    """
    # Determine current price from the lowest timeframe (most up to date)
    if not candles_per_tf:
        raise ValueError("no candles supplied")
    lowest_tf_df = next(iter(candles_per_tf.values()))
    if lowest_tf_df.is_empty():
        raise ValueError("empty candle frame")
    current_price = float(lowest_tf_df["close"][-1])

    per_tf: dict[str, TimeframeFeatures] = {}
    for tf, df in candles_per_tf.items():
        if df.is_empty():
            continue
        # Skip timeframes with too few bars to compute anything useful.
        # 30 bars covers FVG (3-candle), basic swings, and gives the LLM enough
        # candle history to reason. Below that the TF is just noise.
        if df.height < 30:
            continue
        enriched = add_indicators(df)
        fvgs = detect_fvgs(enriched)
        obs = detect_order_blocks(enriched)
        sw = detect_swings(enriched)

        # Keep unmitigated, near current price
        band_lo = current_price * (1 - nearby_zone_pct)
        band_hi = current_price * (1 + nearby_zone_pct)

        active_fvgs = [
            f
            for f in fvgs
            if not f.mitigated and (band_lo <= f.top and f.bottom <= band_hi)
        ]
        active_obs = [
            o
            for o in obs
            if not o.mitigated and (band_lo <= o.top and o.bottom <= band_hi)
        ]

        # Tail candles for the prompt
        tail = enriched.tail(last_n_for_prompt)

        per_tf[tf] = TimeframeFeatures(
            timeframe=tf,
            candles=tail,
            fvgs=active_fvgs[-10:],  # cap
            order_blocks=active_obs[-10:],
            swings=sw[-10:],
        )

    return FeatureBundle(
        symbol=symbol,
        current_price=current_price,
        per_timeframe=per_tf,
    )
