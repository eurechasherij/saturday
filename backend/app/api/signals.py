from datetime import datetime

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.data import query_klines
from app.patterns.features import build_features
from app.providers.registry import get_provider
from app.schemas.signal import SignalRequest, TradingSignal
from app.signals.pipeline import generate_signal

router = APIRouter()


@router.post("/generate", response_model=TradingSignal)
async def generate_one(req: SignalRequest) -> TradingSignal:
    """Generate a single live signal against the latest data on disk."""
    provider = req.provider or settings.default_provider
    model = req.model or get_provider(provider).default_model

    candles_per_tf = {}
    for tf in req.timeframes:
        df = query_klines(req.symbol, tf, limit=500)
        if not df.is_empty():
            candles_per_tf[tf] = df

    if not candles_per_tf:
        raise HTTPException(
            status_code=404,
            detail=f"no candles for {req.symbol} on {req.timeframes}; ingest data first",
        )

    features = build_features(req.symbol, candles_per_tf)
    signal, _ = await generate_signal(
        features,
        provider=provider,
        model=model,
        timestamp=datetime.utcnow(),
        timeframes=req.timeframes,
        use_cache=False,  # live = always fresh
    )
    return signal
