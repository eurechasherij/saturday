from datetime import datetime

from pydantic import BaseModel


class KlineRow(BaseModel):
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    trades: int = 0
    close_time: datetime | None = None


class SymbolStatus(BaseModel):
    symbol: str
    timeframe: str
    rows: int
    first_open_time: datetime | None
    last_open_time: datetime | None


class IngestRequest(BaseModel):
    symbol: str
    timeframe: str = "1h"
    start: str  # YYYY-MM
    end: str | None = None  # YYYY-MM, defaults to current month
