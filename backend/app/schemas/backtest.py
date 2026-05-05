from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BacktestStatus = Literal["pending", "running", "completed", "failed"]


class BacktestConfig(BaseModel):
    symbol: str
    timeframes: list[str] = Field(default_factory=lambda: ["1h", "4h"])
    start: datetime
    end: datetime

    provider: str = "ollama"
    model: str = "qwen2.5:7b-instruct"
    prompt_version: str = "v1"

    # Sizing
    starting_equity: float = 10_000.0
    position_pct: float = 0.10
    leverage: int = 1
    confidence_threshold: int = 60

    # Trigger config — only ask the LLM when price taps an unmitigated FVG/OB
    use_trigger: bool = True
    trigger_proximity_pct: float = 0.001  # 0.1% — how close price must come


class Trade(BaseModel):
    symbol: str
    direction: Literal["LONG", "SHORT"]
    entry_time: datetime
    entry_price: float
    exit_time: datetime | None = None
    exit_price: float | None = None
    exit_reason: Literal["TP", "SL", "TIMEOUT", "OPEN"] = "OPEN"

    notional: float
    leverage: int

    stop_loss: float
    take_profit: float
    confidence: int

    pnl: float = 0.0
    pnl_pct: float = 0.0  # of starting equity at entry

    signal_id: str = ""  # lookup key into signals.parquet


class EquityPoint(BaseModel):
    time: datetime
    equity: float


class BacktestRunSummary(BaseModel):
    run_id: str
    status: BacktestStatus
    config: BacktestConfig
    started_at: datetime
    finished_at: datetime | None = None

    # Counters / progress
    bars_total: int = 0
    bars_processed: int = 0
    triggers_fired: int = 0
    llm_calls: int = 0
    cache_hits: int = 0

    # Metrics (populated when completed)
    final_equity: float | None = None
    total_return: float | None = None  # fraction
    max_drawdown: float | None = None
    win_rate: float | None = None
    profit_factor: float | None = None
    sharpe: float | None = None
    trades: int = 0

    error: str | None = None
