"""Build the system + user prompt that goes to the LLM.

Versioned: bump PROMPT_VERSION whenever the wording changes meaningfully.
The cache key includes the prompt text and the system message, so version bumps
naturally invalidate old cached responses.

The system message has stronger attention than user-prompt prefixes for most
modern instruction-tuned models, so we use it for hard constraints (language,
output format) rather than burying them inside the data prompt.
"""

from __future__ import annotations

import polars as pl

from app.patterns.features import FeatureBundle, TimeframeFeatures

PROMPT_VERSION = "v3"

# CRITICAL: The bilingual language directive is intentional. Writing the rule
# in the language we want to suppress (Chinese) makes the model "see" the
# constraint and route around it. English-only directives are not enough for
# qwen2.5 and similar Chinese-trained models on financial prompts.
SYSTEM_MESSAGE = """⚠️ LANGUAGE LOCK — READ CAREFULLY ⚠️

You MUST respond in English only.
你必须使用英文回答。不要使用任何中文字符 (汉字)。
Do NOT use Chinese (中文), Japanese, Korean, or any non-English language.
所有输出必须是英文。If non-English characters appear in your output, your response is invalid.

You are a disciplined crypto futures analyst. You receive structured market data and active price-action zones (Fair Value Gaps and Order Blocks). Your job: emit one trading signal in strict JSON.

Decision rules:
- Only LONG or SHORT if there is a clear, well-justified setup. Otherwise emit direction=NONE with confidence=0.
- ENTRY must be at or very near the provided current_price.
- For LONG: stop_loss < entry < take_profit. For SHORT: take_profit < entry < stop_loss.
- Stops must be placed below a swing low (LONG) or above a swing high (SHORT), or beyond an unmitigated zone — never at arbitrary round numbers.
- risk_reward = |TP - entry| / |entry - SL|. Aim for >= 1.5; reject the setup otherwise.
- confidence is an integer 0-100. Be honest. 90+ means "I would bet real money". 60-80 is "decent setup". Below 60, prefer NONE.
- features_used: list specific zones or indicators you actually used (English identifiers like "bullish_fvg_1", "swing_low_4h", "rsi_oversold").
- thoughts: 2-4 sentences of CONCRETE ENGLISH reasoning citing specific candles, zones, or indicator values.

Example of a correct thoughts field (note: English only):
"Price is testing the bullish FVG at 64600-64800 from above. RSI on 1h is recovering from 32 indicating exhaustion of the pullback. The 4h swing low at 63500 provides a logical stop. Targeting the prior 4h swing high at 65900 gives RR ~2.1."

Output strict JSON matching the schema. No markdown, no code fences, no prose outside JSON. ENGLISH ONLY."""


def build_prompt(features: FeatureBundle, *, max_candles: int = 30) -> str:
    """Build the per-request user message containing market data + zones."""
    parts: list[str] = []
    parts.append(f"symbol: {features.symbol}")
    parts.append(f"current_price: {features.current_price:.6f}")
    parts.append("")

    for tf, tff in features.per_timeframe.items():
        parts.append(_render_timeframe(tff, max_candles))
        parts.append("")

    parts.append("Now emit the trading signal as strict JSON. Reminder: respond in English only.")
    return "\n".join(parts)


def _render_timeframe(tff: TimeframeFeatures, max_candles: int) -> str:
    lines = [f"=== Timeframe: {tff.timeframe} ==="]

    if tff.fvgs:
        lines.append("Active Fair Value Gaps (unmitigated, near price):")
        for i, f in enumerate(tff.fvgs):
            lines.append(
                f"  fvg_{i}: {f.type} | top={f.top:.6f} bottom={f.bottom:.6f} "
                f"formed={f.formed_at.isoformat()}"
            )
    else:
        lines.append("Active Fair Value Gaps: none")

    if tff.order_blocks:
        lines.append("Active Order Blocks (unmitigated, near price):")
        for i, o in enumerate(tff.order_blocks):
            lines.append(
                f"  ob_{i}: {o.type} | top={o.top:.6f} bottom={o.bottom:.6f} "
                f"formed={o.formed_at.isoformat()}"
            )
    else:
        lines.append("Active Order Blocks: none")

    if tff.swings:
        lines.append("Recent swings:")
        for s in tff.swings[-5:]:
            lines.append(f"  swing_{s.type}: {s.price:.6f} @ {s.time.isoformat()}")

    lines.append(f"Last {min(max_candles, tff.candles.height)} candles (newest last):")
    lines.append(_format_candles(tff.candles.tail(max_candles)))
    return "\n".join(lines)


def _format_candles(df: pl.DataFrame) -> str:
    cols = ["open_time", "open", "high", "low", "close", "volume"]
    extras = [c for c in ("rsi_14", "macd", "macd_hist", "atr_14") if c in df.columns]
    cols += extras

    rows = []
    for r in df.select(cols).iter_rows(named=True):
        time = r["open_time"].strftime("%Y-%m-%d %H:%M") if r["open_time"] else ""
        bits = [
            f"t={time}",
            f"o={r['open']:.4f}",
            f"h={r['high']:.4f}",
            f"l={r['low']:.4f}",
            f"c={r['close']:.4f}",
            f"v={r['volume']:.1f}",
        ]
        for ex in extras:
            v = r[ex]
            bits.append(f"{ex}={v:.3f}" if v is not None else f"{ex}=na")
        rows.append("  " + " ".join(bits))
    return "\n".join(rows)
