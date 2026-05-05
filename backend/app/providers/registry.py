"""Single source of truth for which providers exist + lookup."""

from __future__ import annotations

import logging

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.base import LLMProvider
from app.providers.ollama import OllamaProvider
from app.providers.openai_provider import OpenAIProvider
from app.schemas.provider import ProviderInfo

log = logging.getLogger(__name__)

_REGISTRY: dict[str, LLMProvider] = {
    "ollama": OllamaProvider(),
    "openai": OpenAIProvider(),
    "anthropic": AnthropicProvider(),
}


def get_provider(name: str) -> LLMProvider:
    if name not in _REGISTRY:
        raise ValueError(f"unknown provider '{name}'. known: {list(_REGISTRY)}")
    return _REGISTRY[name]


def available_providers() -> list[str]:
    return list(_REGISTRY.keys())


async def list_provider_info() -> list[ProviderInfo]:
    out: list[ProviderInfo] = []
    for name, prov in _REGISTRY.items():
        avail = await prov.is_available()
        models = await prov.list_models() if avail else []
        note = ""
        if not avail:
            if name == "ollama":
                note = "Ollama not reachable. Start the daemon: `ollama serve`."
            else:
                note = f"No API key configured (set SATURDAY_{name.upper()}_API_KEY)."
        out.append(
            ProviderInfo(
                name=name,  # type: ignore[arg-type]
                available=avail,
                default_model=prov.default_model,
                models=models,
                note=note,
            )
        )
    return out
