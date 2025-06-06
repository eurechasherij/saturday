import { useState, useEffect } from 'react';
import { Position, Transaction, PerformanceMetrics, ConnectionStatus } from '../types/trading';
import { getPositions, getTransactions, getPerformanceMetrics, getConnectionStatus, getTradingSignals } from '../api/trading';
import { useToast } from './useToast';

export const useTradingData = () => {
  const { toast } = useToast();
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    binance: false,
    openai: false,
    database: false,
    lastChecked: ''
  });
  const [tradingSignals, setTradingSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const shallowEqual = (a: any[], b: any[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]._id !== b[i]._id) return false;
    }
    return true;
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('useTradingData: Starting data fetch...');

      const [
        positionsResponse,
        transactionsResponse,
        metricsResponse,
        statusResponse,
        signalsResponse
      ] = await Promise.all([
        getPositions(),
        getTransactions(20),
        getPerformanceMetrics(),
        getConnectionStatus(),
        getTradingSignals(50)
      ]);

      console.log('useTradingData: Positions response:', positionsResponse);
      console.log('useTradingData: Transactions response:', transactionsResponse);
      console.log('useTradingData: Metrics response:', metricsResponse);
      console.log('useTradingData: Status response:', statusResponse);
      console.log('useTradingData: Signals response:', signalsResponse);

      // Only update state if data has changed (shallow compare by _id)
      if (!shallowEqual(positionsResponse.positions || [], positions)) {
        setPositions(positionsResponse.positions || []);
      }
      if (!shallowEqual(transactionsResponse.transactions || [], transactions)) {
        setTransactions(transactionsResponse.transactions || []);
      }
      if (JSON.stringify(metricsResponse.metrics || null) !== JSON.stringify(metrics)) {
        setMetrics(metricsResponse.metrics || null);
      }
      if (JSON.stringify(statusResponse.status || {}) !== JSON.stringify(connectionStatus)) {
        setConnectionStatus(statusResponse.status || {
          binance: false,
          openai: false,
          database: false,
          lastChecked: ''
        });
      }
      if (!shallowEqual(signalsResponse.signals || [], tradingSignals)) {
        setTradingSignals(signalsResponse.signals || []);
      }

      console.log('useTradingData: State updated successfully');
    } catch (error) {
      console.error('useTradingData: Error fetching trading data:', error);
      console.log('useTradingData: Setting default values due to error');
      
      // Set safe default values on error
      setPositions([]);
      setTransactions([]);
      setMetrics(null);
      setConnectionStatus({
        binance: false,
        openai: false,
        database: false,
        lastChecked: ''
      });
      setTradingSignals([]);
      
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch trading data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      console.log('useTradingData: Data fetch completed');
    }
  };

  useEffect(() => {
    fetchData();

    // Set up periodic data refresh
    const interval = setInterval(fetchData, 60000); // Refresh every 60 seconds
    
    return () => clearInterval(interval);
  }, []);

  console.log('useTradingData: Current state - positions:', positions, 'transactions:', transactions, 'signals:', tradingSignals);

  return {
    positions,
    transactions,
    metrics,
    connectionStatus,
    tradingSignals,
    loading,
    refetch: fetchData
  };
};