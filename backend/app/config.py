from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="SATURDAY_", extra="ignore")

    # Storage
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"

    # Default provider/model
    default_provider: Literal["ollama", "openai", "anthropic"] = "ollama"
    default_model: str = "qwen2.5:7b-instruct"

    # Ollama
    ollama_host: str = "http://localhost:11434"

    # External keys (optional — only needed for non-Ollama providers)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None

    # Binance
    binance_rest_base: str = "https://api.binance.com"
    binance_vision_base: str = "https://data.binance.vision"

    # Backtest defaults
    default_symbols: list[str] = [
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "XRPUSDT",
        "DOGEUSDT",
    ]
    default_position_pct: float = 0.10
    default_leverage: int = 1
    default_confidence_threshold: int = 60

    # API
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]

    @property
    def parquet_dir(self) -> Path:
        return self.data_dir / "parquet"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    @property
    def backtests_dir(self) -> Path:
        return self.data_dir / "backtests"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    def ensure_dirs(self) -> None:
        for p in (self.parquet_dir, self.cache_dir, self.backtests_dir, self.raw_dir):
            p.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
