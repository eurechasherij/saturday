# Saturday — Design Document

> **Status:** Greenfield rebuild. The existing Go/MongoDB/React code in this repo will be archived and replaced. Nothing in `server/` or `client/` survives as-is.

## 1. Vision

Saturday is a **personal AI trading research tool** for crypto futures. It is not a trading bot.

The core loop:

1. Feed an LLM structured market context (OHLCV + computed patterns: FVG, Order Blocks, indicators).
2. Ask it for a structured trade signal (direction, entry, SL, TP, confidence, reasoning).
3. Replay this loop against years of historical data to evaluate whether the AI's signals would have made money.
4. Swap LLM providers (local Ollama, OpenAI, Anthropic, etc.) to compare model quality on the same task.

The output is **knowledge**, not trades — "does this prompting strategy + this model + these features produce edge?"

## 2. Goals

- **Backtest-first.** Every feature must be runnable against historical data without a live exchange connection.
- **Local-first.** Default LLM is Ollama running on the user's machine. Zero API cost to iterate.
- **Provider-agnostic.** Default is local Ollama (free). Swap to OpenAI/Anthropic when you want a stronger model or when the local one isn't cutting it. Adding a new provider is a single-file change. *This is a fallback mechanism, not a benchmarking feature — only one provider is active per run.*
- **Reproducible.** Same OHLCV window + same prompt + same model + temperature 0 → same signal. Caching is a first-class concern, not an afterthought.
- **Numerical inputs only.** OHLCV, indicators, FVG/OB coordinates as numbers. No chart screenshots. LLMs reason better over structured text than images for this domain.

## 3. Non-goals (for now)

- **No live trading.** No Binance order placement, no API keys for execution. The exchange is a read-only data source.
- **No real-time signal generation.** Phase 1 is offline backtesting only. Live paper-trading comes later.
- **No portfolio management.** Single symbol, single position at a time per backtest run.
- **No multi-user, no auth, no deployment story.** Runs on localhost.

## 4. Stack

### Backend: Python 3.12+

| Concern | Choice | Why |
|---|---|---|
| Web framework | **FastAPI** | Async, auto OpenAPI, pydantic-native |
| Data manipulation | **Polars** | 5-10× faster than pandas, cleaner API |
| Analytical queries | **DuckDB** | Queries Parquet directly, zero-config OLAP |
| Storage | **Parquet files** | Columnar, compressed, partitioned by symbol/timeframe |
| LLM clients | **`ollama`, `openai`, `anthropic` SDKs** behind a provider interface | First-class SDKs, no LiteLLM lock-in |
| HTTP | **httpx** | Async, modern |
| Schemas | **Pydantic v2** | Validation + serialization in one place |
| Package manager | **uv** | Fast, lockfile, no venv ceremony |
| Lint / format | **ruff** | One tool, instant |
| Types | **pyright** (strict on `app/`) | Catches LLM-output drift before runtime |
| Tests | **pytest** | Standard |

### Frontend: Vite + React 18 + TypeScript

Vite over Next.js because this is a local single-page tool — no SSR, no SEO, no edge runtime. Vite's dev loop is faster and the mental model is simpler.

| Concern | Choice |
|---|---|
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Charts | **Lightweight Charts** (TradingView's open-source library) for candles; **Recharts** for equity curves |
| Server state | TanStack Query |
| Client state | Zustand (only if needed — start without) |
| Forms | react-hook-form + zod |

### Data store

No MongoDB, no Postgres. Just files:

```
data/
  parquet/
    klines/symbol=BTCUSDT/timeframe=1h/year=2024/data.parquet
    klines/symbol=BTCUSDT/timeframe=1h/year=2025/data.parquet
  cache/
    llm/<prompt-hash>.json    # cached LLM responses for backtest replay
  backtests/
    <run-id>/
      config.json
      signals.parquet
      equity.parquet
      summary.json
```

A SQLite DB (or just a JSON index) tracks backtest run metadata. Add Postgres only if/when this stops scaling.

## 5. Historical data strategy

This is the most-asked question, so calling it out:

**Source:** [data.binance.vision](https://data.binance.vision/) — Binance's official bulk data dumps. Free, no API key, no rate limits, monthly + daily ZIP files of every kline timeframe, going back to 2017.

**Why not the REST API?** Rate-limited, paginated, painful to backfill years of data. Vision dumps are the same data, in bulk, downloadable in parallel.

**Pipeline:**

1. **Bulk backfill** (one-time per symbol):
   - Download monthly ZIPs from Binance Vision for each `(symbol, timeframe)` pair.
   - Unzip, parse CSV, write to Parquet partitioned by year.
   - ~5 minutes for 5 years of 1h candles per symbol.
2. **Incremental updates**:
   - Daily cron (or manual): pull last N days from Binance REST API, append to current year's Parquet.
3. **Querying**:
   - DuckDB reads Parquet directly: `SELECT * FROM 'data/parquet/klines/symbol=BTCUSDT/**/*.parquet' WHERE open_time BETWEEN ...`
   - Sub-second over millions of rows.

For a hobby project this is the sweet spot. No database to administer, files diff well in git LFS if you want to version a snapshot, and it scales to terabytes before you'd ever need to switch.

## 6. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React UI (Vite)                                        │
│  - Backtest runner / results viewer                     │
│  - Signal inspector (prompt + response + reasoning)     │
│  - Strategy editor (provider, model, params)            │
│  - Data browser (what symbols/timeframes are loaded)    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼────────────────────────────────┐
│  FastAPI                                                │
│  /api/data       — ingest, list, query OHLCV            │
│  /api/signals    — generate one-off signal (live mode)  │
│  /api/backtest   — run, list, inspect backtests         │
│  /api/providers  — list models, health-check Ollama     │
└────────────────────────┬────────────────────────────────┘
                         │
   ┌─────────────────────┼─────────────────────┐
   │                     │                     │
┌──▼──────────┐  ┌───────▼────────┐  ┌─────────▼────────┐
│ Data layer  │  │ Pattern engine │  │ Signal pipeline  │
│             │  │                │  │                  │
│ • Binance   │  │ • Indicators   │  │ • Prompt builder │
│   Vision    │  │   (RSI, MACD,  │  │ • Provider call  │
│   ingest    │  │   ATR, OBV)    │  │ • Response parse │
│ • Parquet   │  │ • FVG detector │  │ • Validation     │
│   store     │  │ • OB detector  │  │ • Cache layer    │
│ • DuckDB    │  │ • Swing H/L    │  │                  │
└─────────────┘  └────────────────┘  └────────┬─────────┘
                                              │
                                     ┌────────▼──────────┐
                                     │ Provider adapters │
                                     │ • Ollama (local)  │
                                     │ • OpenAI          │
                                     │ • Anthropic       │
                                     │ • +1 file per new │
                                     └───────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Backtest engine                                         │
│ Iterates bars in time order → for each evaluation point:│
│   1. Slice OHLCV window                                 │
│   2. Compute features (patterns + indicators)           │
│   3. Build prompt → call provider (cached!)             │
│   4. Parse signal → simulate fill / SL / TP             │
│   5. Update equity curve                                │
│ Outputs: trades, equity curve, summary metrics          │
└─────────────────────────────────────────────────────────┘
```

## 7. Provider abstraction

Single interface, one file per provider:

```python
class LLMProvider(Protocol):
    name: str
    async def complete(
        self,
        prompt: str,
        *,
        model: str,
        temperature: float = 0.0,
        json_schema: dict | None = None,
    ) -> ProviderResponse: ...
```

Each provider lives in `app/providers/{ollama,openai,anthropic}.py`. Adding a new one = implement the protocol, register in a dict. That's it.

**Structured output:** when the provider supports it (OpenAI structured outputs, Ollama format=json with a schema, Anthropic tool use), use it. Otherwise fall back to "respond with JSON" prompting + retry-on-parse-failure. The signal schema is the source of truth.

## 8. Pattern engine

Computed in Python (Polars), passed to the LLM as text:

- **Indicators** (numeric series, last N values appended to prompt): RSI(14), MACD(12,26,9), ATR(14), OBV.
- **FVG (Fair Value Gap)** — *ICT-style default*: 3-candle imbalance where candle[n-2].high < candle[n].low (bullish FVG) or candle[n-2].low > candle[n].high (bearish FVG). Emit `{type, top, bottom, candle_index, mitigated}`. Mitigated = price has since traded back into the gap.
- **Order Block** — *ICT-style default*: last opposing candle before a displacement move that breaks structure. For a bullish OB: last down-candle before an up-move that takes out a prior swing high. Emit `{type, top, bottom, candle_index, mitigated}`.
- **Swing highs/lows**: fractal detection — a high is a swing high if it's higher than N bars on each side (default N=2).
- **Liquidity zones** (later): equal highs/lows, prior day high/low.

The LLM never sees raw 1000-candle dumps. It sees: current price, last ~20-30 candles in tabular form, plus a structured "context block" listing active (unmitigated) FVGs and OBs near current price. This keeps prompts short and signal-rich.

## 9. Signal schema

```python
class TradingSignal(BaseModel):
    # Identity
    symbol: str
    timeframes: list[str]                 # e.g. ["1h", "4h"]
    timestamp: datetime                   # bar close time the signal was generated for

    # Decision
    direction: Literal["LONG", "SHORT", "NONE"]
    entry: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    confidence: int                       # 0-100

    # Reasoning
    thoughts: str                         # free-form analysis
    features_used: list[str]              # which FVGs/OBs/indicators drove the call

    # Reproducibility
    model: str                            # e.g. "ollama:llama3.1:8b"
    prompt_hash: str                      # sha256 of prompt — enables cache lookup
    prompt_version: str                   # e.g. "v3-meta-agent"
```

`NONE` is allowed (the old code forced LONG/SHORT even with confidence 0 — that was wrong). A signal with `direction=NONE` means "no trade." Backtest engine ignores those.

## 10. Backtest engine

**Default symbol scope:** `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `XRPUSDT`, `DOGEUSDT`.

**Position sizing:** fixed-fractional. Each trade opens with `notional = 0.10 × current_equity`. Leverage defaults to 1× in backtest (configurable per run). Loss per trade is bounded by `(|entry − SL| / entry) × notional × leverage`, not 10% of equity — sizing is by *capital allocated*, not *risk*.

The hard constraint: **LLM-in-the-loop backtests cannot be vectorized.** Each bar requires a prompt + provider call. So the engine is sequential — but with three critical optimizations:

1. **Prompt caching**: `(prompt_hash, model, temperature) → cached response` on disk. Re-running the same backtest is free after the first pass. This makes iteration on the *backtest harness* (not the prompt) instant.
2. **Trigger-based evaluation**: signals are *not* generated on every bar close. The engine runs cheap pattern detection on every closed bar, and only invokes the LLM when a **trigger condition** fires — by default, when price taps an unmitigated FVG or OB on the analysis timeframe. This is realistic (you wouldn't ask "should I trade?" 24× a day) and cuts LLM calls by 1-2 orders of magnitude vs every-bar evaluation.
3. **Parallel symbols**: independent symbols run in parallel.

**Run lifecycle:**

```
Config (symbol, range, timeframes, provider, model, prompt_version,
        trigger_rules, sizing_pct=0.10, leverage=1)
  → Iterate bars in time order
  → At each closed bar:
      update active patterns (FVG, OB, swings)
      check trigger rules (price tapped active FVG/OB?)
      if triggered:
        build features → build prompt → call provider (cached) → parse signal
        if direction != NONE and confidence ≥ threshold:
          open position: notional = 0.10 × equity, with SL/TP from signal
      track open positions bar-by-bar; close on SL/TP hit
  → Aggregate: trades.parquet, equity.parquet, metrics.json
```

**Metrics emitted:** total return, max drawdown, win rate, profit factor, Sharpe, average RR realized vs predicted, confidence-bucketed win rate (does "90 confidence" actually win more than "60"?).

## 11. Frontend

Total rebuild. The old dashboard tried to be a live trading cockpit — that's the wrong shape now.

**New shape: a research notebook.**

Pages:

1. **Data** — what symbols/timeframes are ingested, last-update timestamps, "ingest more" action.
2. **Backtest** — configure a run (symbol, date range, provider, model, prompt version), launch, watch progress (SSE stream), view results.
3. **Run viewer** — for a completed run: equity curve, trade list, per-trade drill-down showing the *exact prompt sent*, *exact response received*, *features at that bar*. This is the killer feature — you can audit why the AI made every call.
4. **Live signal** — one-off "generate signal for current market" without backtest.
5. **Settings** — pick the active provider (Ollama / OpenAI / Anthropic), set API keys, choose default model.

Visual style: dense, terminal-adjacent, dark by default. Think Linear meets a Bloomberg terminal. shadcn defaults, tweaked.

## 12. Project layout

```
saturday/
├── DESIGN.md
├── README.md
├── pyproject.toml             # uv-managed
├── backend/
│   └── app/
│       ├── main.py            # FastAPI entrypoint
│       ├── api/               # route modules
│       ├── core/              # config, logging
│       ├── data/              # binance vision ingest, parquet, duckdb
│       ├── patterns/          # indicators, fvg, ob, swings
│       ├── providers/         # ollama.py, openai.py, anthropic.py, base.py
│       ├── signals/           # prompt building, response parsing, cache
│       ├── backtest/          # engine, metrics, simulator
│       └── schemas/           # pydantic models (signal, run, etc.)
├── frontend/
│   ├── package.json
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── lib/api.ts         # typed client (generated from OpenAPI)
│       └── ...
├── data/                      # gitignored
│   ├── parquet/
│   ├── cache/
│   └── backtests/
└── tests/
```

## 13. Locked decisions

| Decision | Choice |
|---|---|
| FVG/OB definitions | ICT-style defaults (see §8) |
| Evaluation cadence | Trigger-based — only when price taps an unmitigated FVG/OB |
| Agent architecture | **Single-agent first.** Multi-agent (trend/reversal/volume/meta) is Phase 7, only if single-agent shows signal |
| Position sizing | Fixed-fractional: notional = 10% of current equity per trade, default 1× leverage |
| Initial symbols | BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, DOGEUSDT |

## 14. Roadmap

| Phase | Deliverable |
|---|---|
| **0 — Scaffolding** | uv + FastAPI hello world, Vite + React shell, shared OpenAPI client |
| **1 — Data** | Binance Vision ingest, Parquet store, DuckDB query API, "Data" page |
| **2 — Patterns** | Indicators + FVG + OB + swings, all unit-tested against fixtures |
| **3 — Provider layer** | Ollama adapter + base protocol, prompt builder, response parser, cache |
| **4 — Signal pipeline** | End-to-end: feed a bar → get a signal back via Ollama. Single-agent. |
| **5 — Backtest engine** | Sequential simulator + metrics, "Backtest" + "Run viewer" UI |
| **6 — Multi-provider** | OpenAI + Anthropic adapters, "Compare" view |
| **7 — Multi-agent** | Reintroduce trend/reversal/volume/meta if single-agent shows promise |
| **8 — Live signal mode** | Real-time signal generation against current market (still no execution) |

Each phase ships something usable on its own. Phase 5 is the first "the project does the thing" milestone.

---

*Authoritative until contradicted by a newer commit to this file.*
