"""LLMProvider protocol — the single seam between the rest of the codebase and any model vendor.

A provider takes a prompt + optional JSON schema and returns text. It does not
know about caching, signal parsing, or the trading domain. Adding a new provider
is one new file implementing this protocol.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class ProviderResponse(BaseModel):
    text: str
    model: str
    provider: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    raw: dict | None = None


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    default_model: str

    async def is_available(self) -> bool: ...

    async def list_models(self) -> list[str]: ...

    async def complete(
        self,
        prompt: str,
        *,
        model: str | None = None,
        temperature: float = 0.0,
        json_schema: dict | None = None,
        system: str | None = None,
    ) -> ProviderResponse: ...
