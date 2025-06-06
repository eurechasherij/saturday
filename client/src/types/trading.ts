export interface TradingSignal {
  _id?: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number;
  thoughts: string;
  timestamp: string;
  leverage: number;
  status?: 'Active' | 'Waiting' | 'Processing' | 'Executed' | 'Completed' | 'Failed';
  timeframesAnalyzed?: string[];
  marketDataSummary?: Record<string, string>;
}

export interface Position {
  _id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercentage: number;
  leverage: number;
  timestamp: string;
  status: 'Open' | 'Closed';
}

export interface Transaction {
  _id: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'STOP_LOSS' | 'TAKE_PROFIT';
  amount: number;
  price: number;
  timestamp: string;
  status: 'Success' | 'Failed' | 'Pending';
  pnl?: number;
}

export interface PerformanceMetrics {
  dailyPnL: number;
  dailyPnLPercentage: number;
  allTimePnL: number;
  allTimePnLPercentage: number;
  winRate: number;
  totalTrades: number;
  winStreak: number;
  lossStreak: number;
  currentStreak: number;
  currentStreakType: 'win' | 'loss' | 'none';

  // New transaction-based metrics
  totalTransactions: number;
  totalAmount: number;
  averageTransactionSize: number;
  transactionCountByType: Record<string, number>;
  winningTrades: number;
  losingTrades: number;
  openPositions: number;
}

export interface TradingConfig {
  selectedSymbol: string;
  isAutoMode: boolean;
  isTestnet: boolean;
  confidenceThreshold: number;
  aiModel: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4o-2024-05-13';
  isMockMode: boolean;
  selectedTimeframes: string[];
}

export interface ConnectionStatus {
  binance: boolean;
  openai: boolean;
  database: boolean;
  lastChecked: string; // Add this field
}

export interface RealTimePriceData {
  symbol: string;
  currentPrice: number;
  timestamp: string;
  volume24h: number;
  percentChange24h: number;
}