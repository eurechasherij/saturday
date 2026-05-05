"""End-to-end signal generation: features → prompt → provider (cached) → parsed signal."""

from __future__ import annotations

import logging
from datetime import datetime

from app.patterns.features import FeatureBundle
from app.providers.registry import get_provider
from app.schemas.signal import SIGNAL_JSON_SCHEMA, TradingSignal
from app.signals.cache import prompt_cache
from app.signals.parser import parse_signal_response
from app.signals.prompt import PROMPT_VERSION, build_prompt

log = logging.getLogger(__name__)


async def generate_signal(
    features: FeatureBundle,
    *,
    provider: str,
    model: str,
    timestamp: datetime,
    timeframes: list[str],
    temperature: float = 0.0,
    use_cache: bool = True,
) -> tuple[TradingSignal, bool]:
    """Returns (signal, cache_hit)."""
    prompt = build_prompt(features)
    prov = get_provider(provider)
    cache_key = prompt_cache.key(provider, model, temperature, prompt)

    cached = prompt_cache.get(cache_key) if use_cache else None
    if cached is not None:
        signal = parse_signal_response(
            cached.text,
            symbol=features.symbol,
            timeframes=timeframes,
            timestamp=timestamp,
            current_price=features.current_price,
            model=model,
            provider=provider,
            prompt_hash=cache_key,
            prompt_version=PROMPT_VERSION,
        )
        return signal, True

    resp = await prov.complete(
        prompt,
        model=model,
        temperature=temperature,
        json_schema=SIGNAL_JSON_SCHEMA,
    )
    if use_cache:
        prompt_cache.put(cache_key, resp)

    signal = parse_signal_response(
        resp.text,
        symbol=features.symbol,
        timeframes=timeframes,
        timestamp=timestamp,
        current_price=features.current_price,
        model=model,
        provider=provider,
        prompt_hash=cache_key,
        prompt_version=PROMPT_VERSION,
    )
    return signal, False
