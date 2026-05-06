// Typed thin client for the FastAPI backend. Vite proxies /api → :3001.

export type SymbolStatus = {
  symbol: string;
  timeframe: string;
  rows: number;
  first_open_time: string | null;
  last_open_time: string | null;
};

export type ProviderInfo = {
  name: "ollama" | "openai" | "anthropic";
  available: boolean;
  default_model: string;
  models: string[];
  note: string;
};

export type Direction = "LONG" | "SHORT" | "NONE";

export type TradingSignal = {
  symbol: string;
  timeframes: string[];
  timestamp: string;
  direction: Direction;
  entry: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  confidence: number;
  thoughts: string;
  features_used: string[];
  model: string;
  provider: string;
  prompt_hash: string;
  prompt_version: string;
};

export type BacktestConfig = {
  symbol: string;
  timeframes: string[];
  start: string;
  end: string;
  provider: string;
  model: string;
  prompt_version?: string;
  starting_equity?: number;
  position_pct?: number;
  leverage?: number;
  confidence_threshold?: number;
  use_trigger?: boolean;
  trigger_proximity_pct?: number;
};

export type BacktestRunSummary = {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  config: BacktestConfig;
  started_at: string;
  finished_at: string | null;
  bars_total: number;
  bars_processed: number;
  triggers_fired: number;
  llm_calls: number;
  cache_hits: number;
  final_equity: number | null;
  total_return: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  sharpe: number | null;
  trades: number;
  error: string | null;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EquityPoint = { time: number; equity: number };

export type SignalRecord = {
  id: string;
  time: string;
  trigger_reason: string;
  direction: Direction;
  entry: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  thoughts: string;
  features_used: string[];
  cache_hit: boolean;
};

export type Trade = {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry_time: string;
  entry_price: number;
  exit_time: string | null;
  exit_price: number | null;
  exit_reason: "TP" | "SL" | "TIMEOUT" | "OPEN";
  notional: number;
  leverage: number;
  stop_loss: number;
  take_profit: number;
  confidence: number;
  pnl: number;
  pnl_pct: number;
  signal_id: string;
};

async function jsonReq<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Data
  symbols: () => jsonReq<SymbolStatus[]>("/api/data/symbols"),
  defaults: () => jsonReq<{ symbols: string[]; timeframes: string[] }>("/api/data/defaults"),
  ingestStreamUrl: (req: { symbol: string; timeframe: string; start: string; end?: string }) => {
    const params = new URLSearchParams({
      symbol: req.symbol,
      timeframe: req.timeframe,
      start: req.start,
    });
    if (req.end) params.set("end", req.end);
    return `/api/data/ingest/stream?${params.toString()}`;
  },
  refresh: (symbol: string, timeframe: string) =>
    jsonReq<{ rows_merged: number }>(`/api/data/refresh/${symbol}/${timeframe}`, { method: "POST" }),
  klines: (symbol: string, timeframe: string, limit = 500) =>
    jsonReq<{ candles: Candle[] }>(`/api/data/klines/${symbol}/${timeframe}?limit=${limit}`),

  // Providers
  providers: () => jsonReq<ProviderInfo[]>("/api/providers"),

  // Signals
  generateSignal: (req: { symbol: string; timeframes: string[]; provider?: string; model?: string }) =>
    jsonReq<TradingSignal>("/api/signals/generate", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  // Backtests
  listRuns: () => jsonReq<BacktestRunSummary[]>("/api/backtest/runs"),
  getRun: (id: string) => jsonReq<BacktestRunSummary>(`/api/backtest/runs/${id}`),
  createRun: (cfg: BacktestConfig) =>
    jsonReq<BacktestRunSummary>("/api/backtest/runs", {
      method: "POST",
      body: JSON.stringify(cfg),
    }),
  trades: (id: string) => jsonReq<{ trades: Trade[] }>(`/api/backtest/runs/${id}/trades`),
  equity: (id: string) => jsonReq<{ equity: EquityPoint[] }>(`/api/backtest/runs/${id}/equity`),
  signals: (id: string) => jsonReq<{ signals: SignalRecord[] }>(`/api/backtest/runs/${id}/signals`),
  runLog: (id: string, since: number) =>
    jsonReq<{ events: any[]; cursor: number; running: boolean }>(
      `/api/backtest/runs/${id}/log?since=${since}`
    ),
  cancelRun: (id: string) =>
    jsonReq<{ cancelled: boolean; reason: string }>(`/api/backtest/runs/${id}`, {
      method: "DELETE",
    }),
};
