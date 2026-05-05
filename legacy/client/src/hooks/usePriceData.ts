import { useState, useEffect } from 'react';
import { getCurrentPrice, getRealTimePriceData } from '../api/trading';
import { RealTimePriceData } from '../types/trading';

export const usePriceData = (symbol: string) => {
  const [price, setPrice] = useState<number>(0);
  const [change24h, setChange24h] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;

    const fetchPrice = async () => {
      try {
        const response = await getCurrentPrice(symbol);
        setPrice(response.price);
        setChange24h(response.change24h);
      } catch (error) {
        console.error('Error fetching price:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 1000); // Update every second
    return () => clearInterval(interval);
  }, [symbol]);

  return { price, change24h, loading };
};

// New hook for real-time price data with enhanced information
export const useRealTimePriceData = (symbol: string) => {
  const [priceData, setPriceData] = useState<RealTimePriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const fetchRealTimePrice = async () => {
      try {
        setError(null);
        const response = await getRealTimePriceData(symbol);
        setPriceData(response);
      } catch (error: any) {
        console.error('Error fetching real-time price data:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRealTimePrice();
    const interval = setInterval(fetchRealTimePrice, 1000); // Update every second
    return () => clearInterval(interval);
  }, [symbol]);

  return { priceData, loading, error };
};