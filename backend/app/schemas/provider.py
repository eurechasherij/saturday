from typing import Literal

from pydantic import BaseModel

ProviderName = Literal["ollama", "openai", "anthropic", "groq", "gemini"]


class ProviderInfo(BaseModel):
    name: ProviderName
    available: bool
    default_model: str
    models: list[str]
    note: str = ""
