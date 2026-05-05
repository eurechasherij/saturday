"""Ollama provider — the default. Runs locally, free, no API key."""

from __future__ import annotations

import logging

import httpx
import ollama

from app.config import settings
from app.providers.base import LLMProvider, ProviderResponse

log = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    name = "ollama"
    default_model = "qwen2.5:7b-instruct"

    def __init__(self, host: str | None = None) -> None:
        self.host = host or settings.ollama_host
        self._client = ollama.AsyncClient(host=self.host)

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                r = await c.get(f"{self.host}/api/tags")
                return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def list_models(self) -> list[str]:
        try:
            resp = await self._client.list()
            return [m.model for m in resp.models if m.model]
        except Exception as e:
            log.warning("ollama list_models failed: %s", e)
            return []

    async def complete(
        self,
        prompt: str,
        *,
        model: str | None = None,
        temperature: float = 0.0,
        json_schema: dict | None = None,
    ) -> ProviderResponse:
        m = model or self.default_model
        options = {"temperature": temperature}
        # Ollama supports passing a JSON schema via `format`
        format_arg: str | dict = json_schema if json_schema else "json"

        resp = await self._client.generate(
            model=m,
            prompt=prompt,
            options=options,
            format=format_arg,
            stream=False,
        )
        text = resp.response if hasattr(resp, "response") else resp.get("response", "")
        return ProviderResponse(
            text=text,
            model=m,
            provider=self.name,
            prompt_tokens=getattr(resp, "prompt_eval_count", None),
            completion_tokens=getattr(resp, "eval_count", None),
        )
