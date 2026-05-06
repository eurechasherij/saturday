"""Groq provider — free-tier, OpenAI-compatible API, very fast inference.

Sign up at https://console.groq.com → create API key → set SATURDAY_GROQ_API_KEY.
Free tier: generous daily request quota (check current limits at console.groq.com/settings/limits).
"""

from __future__ import annotations

import json
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.providers.base import LLMProvider, ProviderResponse

log = logging.getLogger(__name__)

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Free models on Groq as of 2025. Check https://console.groq.com/docs/models for updates.
_KNOWN_MODELS = [
    "llama-3.3-70b-versatile",   # best quality, recommended
    "llama-3.1-8b-instant",      # fastest, good for high-volume tests
    "mixtral-8x7b-32768",        # longer context (32k)
    "gemma2-9b-it",              # Google Gemma, solid JSON following
]


class GroqProvider(LLMProvider):
    """Groq Cloud — OpenAI-compatible, free tier, extremely low latency."""

    name = "groq"
    default_model = "llama-3.3-70b-versatile"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.groq_api_key
        self._client = (
            AsyncOpenAI(api_key=self.api_key, base_url=_GROQ_BASE_URL)
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
            raise RuntimeError("Groq API key not configured (set SATURDAY_GROQ_API_KEY)")
        m = model or self.default_model

        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "model": m,
            "messages": messages,
            "temperature": temperature,
            # Groq supports response_format json_object but NOT json_schema strict mode yet
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
