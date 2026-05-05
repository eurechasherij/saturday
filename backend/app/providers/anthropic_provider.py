"""Anthropic provider — second fallback. Uses tool-use to coerce structured output."""

from __future__ import annotations

import json
import logging

from anthropic import AsyncAnthropic

from app.config import settings
from app.providers.base import LLMProvider, ProviderResponse

log = logging.getLogger(__name__)

_KNOWN_MODELS = [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]


class AnthropicProvider(LLMProvider):
    name = "anthropic"
    default_model = "claude-sonnet-4-6"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.anthropic_api_key
        self._client = AsyncAnthropic(api_key=self.api_key) if self.api_key else None

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
            raise RuntimeError("Anthropic API key not configured")
        m = model or self.default_model

        # When a schema is provided, use tool-use to get structured output.
        if json_schema is not None:
            tool = {
                "name": "emit_signal",
                "description": "Emit the structured trading signal.",
                "input_schema": json_schema,
            }
            resp = await self._client.messages.create(
                model=m,
                max_tokens=2048,
                temperature=temperature,
                tools=[tool],
                tool_choice={"type": "tool", "name": "emit_signal"},
                messages=[{"role": "user", "content": prompt}],
            )
            tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
            text = json.dumps(tool_use.input) if tool_use else ""
        else:
            resp = await self._client.messages.create(
                model=m,
                max_tokens=2048,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in resp.content if b.type == "text")

        return ProviderResponse(
            text=text,
            model=m,
            provider=self.name,
            prompt_tokens=resp.usage.input_tokens,
            completion_tokens=resp.usage.output_tokens,
        )
