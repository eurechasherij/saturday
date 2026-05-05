"""OpenAI provider — fallback for when Ollama isn't strong enough."""

from __future__ import annotations

import json
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.providers.base import LLMProvider, ProviderResponse

log = logging.getLogger(__name__)

# Curated subset; users can override via model arg.
_KNOWN_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "o3-mini",
]


class OpenAIProvider(LLMProvider):
    name = "openai"
    default_model = "gpt-4o-mini"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.openai_api_key
        self._client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None

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
    ) -> ProviderResponse:
        if self._client is None:
            raise RuntimeError("OpenAI API key not configured")
        m = model or self.default_model

        kwargs: dict = {
            "model": m,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if json_schema is not None:
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "trading_signal",
                    "schema": json_schema,
                    "strict": True,
                },
            }
        else:
            kwargs["response_format"] = {"type": "json_object"}

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
