"""Google Gemini provider — free tier via Google AI Studio.

Sign up at https://aistudio.google.com → "Get API Key" → set SATURDAY_GEMINI_API_KEY.
Free tier (as of 2025): 1,500 req/day, 1M token context window on gemini-2.0-flash.

Uses the openai-compatible endpoint so we don't need the google-generativeai SDK.
"""

from __future__ import annotations

import json
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.providers.base import LLMProvider, ProviderResponse

log = logging.getLogger(__name__)

_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"

_KNOWN_MODELS = [
    "gemini-2.0-flash",        # best free model — fast + smart
    "gemini-2.0-flash-lite",   # even faster, lower quality
    "gemini-1.5-flash",        # stable, widely tested
    "gemini-1.5-pro",          # paid, best reasoning
]


class GeminiProvider(LLMProvider):
    """Google Gemini via OpenAI-compatible REST endpoint."""

    name = "gemini"
    default_model = "gemini-2.0-flash"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.gemini_api_key
        self._client = (
            AsyncOpenAI(api_key=self.api_key, base_url=_GEMINI_BASE_URL)
            if self.api_key
            else None
        )

    async def is_available(self) -> bool:
        return self._client is not None

    async def list_models(self) -> list[str]:
        return _KNOWN_MODELS

    async def complete(
        self,
        prompt: str,
        *,
        model: str | None = None,
        temperature: float = 0.0,
        json_schema: dict | None = None,
        system: str | None = None,
    ) -> ProviderResponse:
        if self._client is None:
            raise RuntimeError("Gemini API key not configured (set SATURDAY_GEMINI_API_KEY)")
        m = model or self.default_model

        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "model": m,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        }

        resp = await self._client.chat.completions.create(**kwargs)
        text = resp.choices[0].message.content or ""
        return ProviderResponse(
            text=text,
            model=m,
            provider=self.name,
            prompt_tokens=resp.usage.prompt_tokens if resp.usage else None,
            completion_tokens=resp.usage.completion_tokens if resp.usage else None,
            raw=json.loads(resp.model_dump_json()),
        )
