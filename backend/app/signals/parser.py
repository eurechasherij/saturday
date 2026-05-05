"""Parse LLM JSON output → TradingSignal, with sanity checks."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime

from app.schemas.signal import TradingSignal

log = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


class SignalParseError(ValueError):
    pass


def _strip_fences(s: str) -> str:
    m = _FENCE_RE.search(s)
    return m.group(1) if m else s


def parse_signal_response(
    raw: str,
    *,
    symbol: str,
    timeframes: list[str],
    timestamp: datetime,
    current_price: float,
    model: str,
    provider: str,
    prompt_hash: str,
    prompt_version: str,
) -> TradingSignal:
    text = _strip_fences(raw).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise SignalParseError(f"not valid JSON: {e}\nraw: {raw[:500]}") from e

    if not isinstance(data, dict):
        raise SignalParseError(f"expected JSON object, got {type(data).__name__}")

    direction = str(data.get("direction", "NONE")).upper()
    if direction not in ("LONG", "SHORT", "NONE"):
        direction = "NONE"

    try:
        entry = float(data.get("entry", 0) or 0)
        sl = float(data.get("stop_loss", 0) or 0)
        tp = float(data.get("take_profit", 0) or 0)
        rr = float(data.get("risk_reward", 0) or 0)
        confidence = int(data.get("confidence", 0) or 0)
    except (TypeError, ValueError) as e:
        raise SignalParseError(f"bad numeric fields: {e}") from e

    confidence = max(0, min(100, confidence))

    sig = TradingSignal(
        symbol=symbol,
        timeframes=timeframes,
        timestamp=timestamp,
        direction=direction,  # type: ignore[arg-type]
        entry=entry,
        stop_loss=sl,
        take_profit=tp,
        risk_reward=rr,
        confidence=confidence,
        thoughts=str(data.get("thoughts", "")),
        features_used=list(data.get("features_used", []) or []),
        model=model,
        provider=provider,
        prompt_hash=prompt_hash,
        prompt_version=prompt_version,
    )

    # Geometry sanity: drop the trade (force NONE) if the signal is internally inconsistent.
    if sig.direction == "LONG" and not (sig.stop_loss < sig.entry < sig.take_profit):
        log.info("signal demoted to NONE: LONG geometry invalid (e=%s sl=%s tp=%s)", entry, sl, tp)
        sig.direction = "NONE"
    elif sig.direction == "SHORT" and not (sig.take_profit < sig.entry < sig.stop_loss):
        log.info("signal demoted to NONE: SHORT geometry invalid")
        sig.direction = "NONE"

    # Entry must be within 0.5% of current_price (LLMs sometimes drift)
    if sig.direction != "NONE" and current_price > 0:
        drift = abs(sig.entry - current_price) / current_price
        if drift > 0.005:
            log.info("signal demoted to NONE: entry drift %.2f%%", drift * 100)
            sig.direction = "NONE"

    return sig
