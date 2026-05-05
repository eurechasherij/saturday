import api from './api';
import { TradingSignal, Position, Transaction, PerformanceMetrics, TradingConfig, ConnectionStatus } from '../types/trading';

console.log('trading.ts: Imported api:', typeof api, !!api);

// Description: Get current price from Binance
// Endpoint: GET /api/trading/binance-price/:symbol
// Request: {}
// Response: { price: number, change24h: number, volume: number }
export const getBinancePrice = async (symbol: string) => {
  console.log('getBinancePrice: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getBinancePrice');
  }

  try {
    const response = await api.get(`/api/trading/binance-price/${symbol}`);
    return response.data;
  } catch (error: any) {
    console.error(error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Generate AI trading signal
// Endpoint: POST /api/trading/generate-signal
// Request: { symbol: string, model: string, timeframes: string[] }
// Response: { signal: TradingSignal }
export const generateTradingSignal = async (data: { symbol: string; model: string; timeframes?: string[] }) => {
  console.log('generateTradingSignal: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in generateTradingSignal');
  }

  try {
    const response = await api.post('/api/trading/generate-signal', data);
    return response.data;
  } catch (error: any) {
    console.error(error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get trading signals
// Endpoint: GET /api/trading/signals
// Request: { limit?: number }
// Response: { signals: TradingSignal[] }
export const getTradingSignals = async (limit = 50) => {
  console.log('getTradingSignals: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getTradingSignals');
  }

  try {
    console.log('getTradingSignals: Making API call to /api/trading/signals');
    const response = await api.get(`/api/trading/signals?limit=${limit}`);
    console.log('getTradingSignals: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getTradingSignals: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Execute trading signal
// Endpoint: POST /api/trading/execute
// Request: { signal: TradingSignal, isTestnet: boolean }
// Response: { success: boolean, transactionId: string, message?: string }
export const executeTrade = async (data: { signal: TradingSignal; isTestnet: boolean }) => {
  console.log('executeTrade: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in executeTrade');
  }

  try {
    const response = await api.post('/api/trading/execute', data);
    return response.data;
  } catch (error: any) {
    console.error(error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get current open positions
// Endpoint: GET /api/trading/positions
// Request: {}
// Response: { positions: Position[] }
export const getPositions = async () => {
  console.log('getPositions: Starting function...');
  console.log('getPositions: API instance check:', typeof api, !!api);

  if (!api) {
    console.error('getPositions: API instance is undefined/null!');
    throw new Error('API instance is not available in getPositions');
  }

  try {
    console.log('getPositions: Making API call to /api/trading/positions');
    const response = await api.get('/api/trading/positions');
    console.log('getPositions: Received response status:', response.status);
    console.log('getPositions: Received response data:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getPositions: Error occurred:', error);
    console.error('getPositions: Error message:', error.message);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Create a new trading position
// Endpoint: POST /api/trading/positions
// Request: { symbol: string, direction: 'LONG' | 'SHORT', size: number, entryPrice: number, leverage: number, isTestnet: boolean, stopLoss?: number, takeProfit?: number }
// Response: { success: boolean, position: Position, message: string }
export const createPosition = async (data: {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  leverage: number;
  isTestnet: boolean;
  stopLoss?: number;
  takeProfit?: number;
}) => {
  console.log('createPosition: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in createPosition');
  }

  try {
    const response = await api.post('/api/trading/positions', data);
    return response.data;
  } catch (error: any) {
    console.error('Error creating position:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Close a trading position
// Endpoint: POST /api/trading/positions/:id/close
// Request: { closePrice: number }
// Response: { success: boolean, position: Position, message: string }
export const closePosition = async (positionId: string, data: { closePrice: number }) => {
  console.log('closePosition: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in closePosition');
  }

  try {
    console.log('closePosition: Making API call to close position:', positionId);
    const response = await api.post(`/api/trading/positions/${positionId}/close`, data);
    console.log('closePosition: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('closePosition: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get transaction history
// Endpoint: GET /api/trading/transactions
// Request: { limit?: number }
// Response: { transactions: Transaction[] }
export const getTransactions = async (limit = 50) => {
  console.log('getTransactions: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getTransactions');
  }

  try {
    console.log('getTransactions: Making API call to /api/trading/transactions');
    const response = await api.get(`/api/trading/transactions?limit=${limit}`);
    console.log('getTransactions: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getTransactions: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get performance metrics
// Endpoint: GET /api/trading/performance
// Request: {}
// Response: { metrics: PerformanceMetrics }
export const getPerformanceMetrics = async () => {
  console.log('getPerformanceMetrics: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getPerformanceMetrics');
  }

  try {
    console.log('getPerformanceMetrics: Making API call to /api/trading/performance');
    const response = await api.get('/api/trading/performance');
    console.log('getPerformanceMetrics: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getPerformanceMetrics: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get connection status
// Endpoint: GET /api/trading/status
// Request: {}
// Response: { status: ConnectionStatus }
export const getConnectionStatus = async () => {
  console.log('getConnectionStatus: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getConnectionStatus');
  }

  try {
    console.log('getConnectionStatus: Making API call to /api/trading/status');
    const response = await api.get('/api/trading/status');
    console.log('getConnectionStatus: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getConnectionStatus: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get current price for symbol
// Endpoint: GET /api/trading/price/:symbol
// Request: {}
// Response: { price: number, change24h: number }
export const getCurrentPrice = async (symbol: string) => {
  console.log('getCurrentPrice: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getCurrentPrice');
  }

  try {
    const response = await api.get(`/api/trading/binance-price/${symbol}`);
    return {
      price: response.data.price,
      change24h: response.data.change24h
    };
  } catch (error: any) {
    console.error('Error fetching current price:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Execute manual JSON signal
// Endpoint: POST /api/trading/execute-manual
// Request: { signalJson: string, isTestnet: boolean }
// Response: { success: boolean, signal: TradingSignal, transactionId: string, message?: string }
export const executeManualSignal = async (data: { signalJson: string; isTestnet: boolean }) => {
  console.log('executeManualSignal: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in executeManualSignal');
  }

  try {
    console.log('executeManualSignal: Making API call to /api/trading/execute-manual');
    const response = await api.post('/api/trading/execute-manual', data);
    console.log('executeManualSignal: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('executeManualSignal: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get real-time price data for cryptocurrency
// Endpoint: GET /api/trading/prices/:symbol
// Request: {}
// Response: { symbol: string, currentPrice: number, timestamp: string, volume24h: number, percentChange24h: number }
export const getRealTimePriceData = async (symbol: string) => {
  console.log('getRealTimePriceData: API instance check:', typeof api, !!api);
  if (!api) {
    throw new Error('API instance is not available in getRealTimePriceData');
  }

  try {
    console.log('getRealTimePriceData: Making API call to /api/trading/prices/' + symbol);
    const response = await api.get(`/api/trading/prices/${symbol}`);
    console.log('getRealTimePriceData: Received response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('getRealTimePriceData: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};

// Description: Get real USDT balance
// Endpoint: GET /api/trading/balance
// Response: { usdtBalance: number }
export const getUsdtBalance = async () => {
  if (!api) throw new Error('API instance is not available in getUsdtBalance');
  try {
    const response = await api.get('/api/trading/balance');
    return response.data;
  } catch (error: any) {
    console.error('getUsdtBalance: Error occurred:', error);
    throw new Error(error?.response?.data?.error || error.message);
  }
};