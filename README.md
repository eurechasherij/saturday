# Saturday

AI-driven crypto futures backtesting & research tool.

> **Status:** v0.1 rebuild complete. Old Go/MongoDB/React code archived in [`legacy/`](legacy/).
> Architecture and goals: [DESIGN.md](DESIGN.md).

## What it does

- Ingests bulk historical OHLCV from Binance Vision (free, no API key, back to 2017).
- Computes structured market features: indicators (RSI, MACD, ATR, OBV), Fair Value Gaps, Order Blocks, swing points.
- Hands those features to an LLM (default: local **Ollama**, fallback: OpenAI / Anthropic) and asks for a structured trade signal.
- Replays the loop bar-by-bar over historical data — a backtest with the AI in the loop.
- Caches every prompt → response pair, so repeated backtests are free.
- Surfaces the entire decision trail in a React dashboard: every trade shows the exact prompt, response, and features the AI saw.

**No live trading. The exchange is read-only.**

## Quickstart

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Node 20+ and [bun](https://bun.sh) (or npm/pnpm)
- [Ollama](https://ollama.com) running locally (recommended default), or an OpenAI/Anthropic API key

### Backend

```bash
cd backend
cp .env.example .env       # only needed if you want OpenAI/Anthropic fallback
uv sync
uv run uvicorn app.main:app --reload --port 3001
```

> The backend runs out of the box with no `.env` if Ollama is reachable at
> `http://localhost:11434`. Edit `.env` only to swap the default provider or
> add API keys. See [`backend/.env.example`](backend/.env.example) for the full list.

API will be at http://localhost:3001 — interactive docs at http://localhost:3001/docs.

### Frontend

```bash
cd frontend
bun install
bun run dev
```

Open http://localhost:5173.

### Pull a model for Ollama

```bash
ollama pull qwen2.5:7b-instruct      # recommended — strong JSON adherence
# or
ollama pull llama3.1:8b
```

### Ingest historical data

From the UI: **Data** page → select a symbol → click *Ingest from Binance Vision*.

Or from the CLI:

```bash
cd backend
uv run python -m app.data.binance_vision BTCUSDT 1h --start 2023-01 --end 2025-04
```

## Project layout

```
saturday/
├── DESIGN.md              # the source of truth for what we're building
├── README.md              # you are here
├── backend/               # Python / FastAPI / Polars / DuckDB
│   ├── pyproject.toml
│   └── app/
│       ├── main.py
│       ├── api/           # FastAPI routes
│       ├── data/          # Binance ingest + Parquet store
│       ├── patterns/      # FVG, OB, indicators
│       ├── providers/     # Ollama / OpenAI / Anthropic adapters
│       ├── signals/       # prompt building + caching
│       ├── backtest/      # simulator + metrics
│       └── schemas/       # pydantic models
├── frontend/              # Vite + React + TS + Tailwind + shadcn
│   └── src/
│       ├── pages/
│       ├── components/
│       └── lib/
├── data/                  # Parquet + caches (gitignored)
└── legacy/                # archived old codebase, kept for reference
```

## License

ISC. Personal hobby project — no warranty, do not point this at real money.
