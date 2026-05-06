from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Direction = Literal["LONG", "SHORT", "NONE"]


class TradingSignal(BaseModel):
    """The structured output we expect from any LLM provider."""

    symbol: str
    timeframes: list[str] = Field(default_factory=list)
    timestamp: datetime

    direction: Direction
    entry: float
    stop_loss: float
    take_profit: float
    risk_reward: float = 0.0
    confidence: int = Field(ge=0, le=100)

    thoughts: str = ""
    features_used: list[str] = Field(default_factory=list)

    # Reproducibility
    model: str = ""
    provider: str = ""
    prompt_hash: str = ""
    prompt_version: str = "v1"

    @property
    def actionable(self) -> bool:
        return (
            self.direction in ("LONG", "SHORT")
            and self.entry > 0
            and self.stop_loss > 0
            and self.take_profit > 0
        )


class SignalRequest(BaseModel):
    """Request to generate a one-off live signal."""

    symbol: str
    timeframes: list[str] = Field(default_factory=lambda: ["1h", "4h"])
    provider: str | None = None
    model: str | None = None


# JSON Schema for structured output (v4+).
# The engine computes entry/SL/TP from ATR — LLM only provides direction + confidence.
SIGNAL_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "direction": {"type": "string", "enum": ["LONG", "SHORT", "NONE"]},
        "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
        "thoughts": {"type": "string"},
        "features_used": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["direction", "confidence", "thoughts"],
    "additionalProperties": False,
}
