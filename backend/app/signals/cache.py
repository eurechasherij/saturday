"""Disk-backed prompt-response cache.

Key = sha256(provider | model | temperature | prompt). Value = JSON of ProviderResponse.

This is the single most important optimization in the system: re-running a
backtest after fixing a bug in the simulator should make zero LLM calls.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from app.config import settings
from app.providers.base import ProviderResponse

log = logging.getLogger(__name__)


def _hash(provider: str, model: str, temperature: float, prompt: str, system: str = "") -> str:
    h = hashlib.sha256()
    h.update(provider.encode())
    h.update(b"\0")
    h.update(model.encode())
    h.update(b"\0")
    h.update(f"{temperature:.6f}".encode())
    h.update(b"\0")
    h.update(system.encode())
    h.update(b"\0")
    h.update(prompt.encode())
    return h.hexdigest()


class PromptCache:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or (settings.cache_dir / "llm")
        self.root.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0

    def _path(self, key: str) -> Path:
        # Shard by first two chars to avoid 1 huge directory.
        return self.root / key[:2] / f"{key}.json"

    def key(self, provider: str, model: str, temperature: float, prompt: str, system: str = "") -> str:
        return _hash(provider, model, temperature, prompt, system)

    def get(self, key: str) -> ProviderResponse | None:
        p = self._path(key)
        if not p.exists():
            self.misses += 1
            return None
        try:
            self.hits += 1
            return ProviderResponse.model_validate_json(p.read_text())
        except Exception as e:
            log.warning("cache read failed for %s: %s", key, e)
            return None

    def put(self, key: str, resp: ProviderResponse) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(resp.model_dump_json())

    def stats(self) -> dict[str, int]:
        return {"hits": self.hits, "misses": self.misses}


# Module-level singleton — keeps stats across requests within a process.
prompt_cache = PromptCache()


_ = json  # keep import — pydantic uses it under the hood for serialization
