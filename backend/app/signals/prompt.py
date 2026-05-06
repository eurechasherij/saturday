"""Build the system + user prompt that goes to the LLM.

v4 design: the LLM decides **direction + confidence** only.
The engine computes SL/TP from ATR — removing level-placement as an LLM task
improves signal quality because small models are unreliable at arithmetic but
good at pattern recognition.

PROMPT_VERSION is part of the cache key; bump it on any meaningful wording change.
"""

from __future__ import annotations

import polars as pl

from app.patterns.features import FeatureBundle, TimeframeFeatures

PROMPT_VERSION = "v4"

# CRITICAL: Bilingual language directive. Writing the constraint in the
# language we want to suppress (Chinese) forces the model to "see" the rule
# before it generates. English-only directives are insufficient for
# Chinese-pretrained models (qwen2.5, etc.) on financial prompts.
SYSTEM_MESSAGE = """⚠️ LANGUAGE LOCK ⚠️
You MUST respond in English only.
你必须使用英文回答。不得使用任何中文字符 (汉字)。
If non-English characters appear in your output, your response is invalid.

You are a disciplined ICT (Inner Circle Trader) crypto analyst.
Price has just tapped an unmitigated Fair Value Gap or Order Block — your job is to decide whether this zone will HOLD and produce a tradable move, or FAIL and get broken through.

## Your responsibilities
- Decide the trade DIRECTION: LONG, SHORT, or NONE.
- Give an honest CONFIDENCE score (0-100).
- Explain your reasoning in 2-4 concrete sentences.

## You do NOT set entry, stop-loss, or take-profit
The engine computes those from ATR automatically. Focus on zone quality and momentum.

## Decision framework
Ask yourself:
1. ZONE QUALITY — is the FVG/OB fresh and unmitigated? How many times has price returned to it? (More touches = weaker)
2. MOMENTUM ALIGNMENT — does RSI / MACD support the direction? (RSI < 35 favors LONG; > 65 favors SHORT. MACD hist turning matches direction)
3. STRUCTURE — does the higher-timeframe (4h/1d) swing structure agree? Is price making HH/HL (bullish) or LH/LL (bearish)?
4. CONFLUENCE — do multiple zones / timeframes agree? FVG + OB on the same level = strong.

## Confidence scale
- 80-100 → Strong confluence: clear zone, aligned momentum, multi-TF agreement. Would trade with real money.
- 60-79  → Decent setup: zone is clean, at least one momentum confirmer.
- 40-59  → Marginal: zone exists but conflicting signals or weak momentum.
- 0-39   → Weak or contradictory. Emit NONE.

## Rules
- Emit NONE if the zone has been tested multiple times (usually breaks on 3rd+)
- Emit NONE if momentum strongly opposes (e.g. RSI 75 for a LONG off FVG)
- Emit NONE if HTF structure is against the trade
- Do NOT force a trade. NONE is a valid, valuable answer.

Output strict JSON — no markdown, no code fences, no prose outside JSON. ENGLISH ONLY."""


def build_prompt(
    features: FeatureBundle,
    *,
    trigger_reason: str | None = None,
    max_candles: int = 30,
) -> str:
    """Build the per-request user message with market context and zone data."""
    parts: list[str] = []
    parts.append(f"symbol: {features.symbol}")
    parts.append(f"current_price: {features.current_price:.6f}")

    if trigger_reason:
        # Tell the LLM *why* we're evaluating this bar — the specific zone that was tapped.
        parts.append(f"trigger: price just tapped → {trigger_reason}")

    parts.append("")

    for tf, tff in features.per_timeframe.items():
        parts.append(_render_timeframe(tff, max_candles))
        parts.append("")

    parts.append(
        "Decide: should we trade this zone tap? "
        "Output JSON with direction, confidence, thoughts, features_used. "
        "English only."
    )
    return "\n".join(parts)


def _render_timeframe(tff: TimeframeFeatures, max_candles: int) -> str:
    lines = [f"=== {tff.timeframe} ==="]

    if tff.fvgs:
        lines.append("Fair Value Gaps (unmitigated, near price):")
        for i, f in enumerate(tff.fvgs):
            lines.append(
                f"  fvg_{i}: {f.type} | top={f.top:.6f} bottom={f.bottom:.6f} "
                f"formed={f.formed_at.strftime('%Y-%m-%d %H:%M')}"
            )
    else:
        lines.append("FVGs: none near price")

    if tff.order_blocks:
        lines.append("Order Blocks (unmitigated, near price):")
        for i, o in enumerate(tff.order_blocks):
            lines.append(
                f"  ob_{i}: {o.type} | top={o.top:.6f} bottom={o.bottom:.6f} "
                f"formed={o.formed_at.strftime('%Y-%m-%d %H:%M')}"
            )
    else:
        lines.append("OBs: none near price")

    if tff.swings:
        lines.append("Recent swing points:")
        for s in tff.swings[-6:]:
            lines.append(f"  {s.type}: {s.price:.6f} @ {s.time.strftime('%Y-%m-%d %H:%M')}")

    lines.append(f"Candles (last {min(max_candles, tff.candles.height)}, newest last):")
    lines.append(_format_candles(tff.candles.tail(max_candles)))
    return "\n".join(lines)


def _format_candles(df: pl.DataFrame) -> str:
    cols = ["open_time", "open", "high", "low", "close", "volume"]
    extras = [c for c in ("rsi_14", "macd_hist", "atr_14") if c in df.columns]
    cols += extras

    rows = []
    for r in df.select(cols).iter_rows(named=True):
        time = r["open_time"].strftime("%m-%d %H:%M") if r["open_time"] else ""
        bits = [
            f"t={time}",
            f"o={r['open']:.4f}",
            f"h={r['high']:.4f}",
            f"l={r['low']:.4f}",
            f"c={r['close']:.4f}",
            f"v={r['volume']:.0f}",
        ]
        for ex in extras:
            v = r[ex]
            bits.append(f"{ex}={v:.3f}" if v is not None else f"{ex}=?")
        rows.append("  " + " ".join(bits))
    return "\n".join(rows)
