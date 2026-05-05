import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { useRealTimePriceData } from '../../hooks/usePriceData';
import { TrendingUp, TrendingDown, Clock, DollarSign, Activity } from 'lucide-react';

export const RealTimePriceDisplay: React.FC = () => {
  const [symbol, setSymbol] = useState('BTC');
  const [activeSymbol, setActiveSymbol] = useState('BTC');
  const { priceData, loading, error } = useRealTimePriceData(activeSymbol);

  const handleSymbolChange = () => {
    setActiveSymbol(symbol);
  };

  const formatPrice = (price: number) => {
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const predefinedSymbols = ['BTC', 'ETH', 'XRP', 'DOGE', 'BTCUSDT', 'ETHUSDT'];

  return (
    <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          Real-Time Price Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Symbol Input */}
        <div className="flex gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Enter symbol (e.g., BTC, ETH)"
            className="flex-1"
          />
          <Button onClick={handleSymbolChange} disabled={loading}>
            {loading ? 'Loading...' : 'Fetch'}
          </Button>
        </div>

        {/* Predefined Symbol Buttons */}
        <div className="flex flex-wrap gap-2">
          {predefinedSymbols.map((sym) => (
            <Button
              key={sym}
              variant={activeSymbol === sym ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSymbol(sym);
                setActiveSymbol(sym);
              }}
            >
              {sym}
            </Button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Price Data Display */}
        {priceData && !loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Current Price */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Current Price</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  ${formatPrice(priceData.currentPrice)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Symbol: {priceData.symbol}</p>
              </div>

              {/* 24h Change */}
              <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  {priceData.percentChange24h >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  )}
                  <span className="text-sm font-medium text-gray-700">24h Change</span>
                </div>
                <p className={`text-2xl font-bold ${priceData.percentChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceData.percentChange24h >= 0 ? '+' : ''}{priceData.percentChange24h.toFixed(2)}%
                </p>
                <Badge 
                  variant={priceData.percentChange24h >= 0 ? "default" : "destructive"}
                  className="mt-1"
                >
                  {priceData.percentChange24h >= 0 ? 'Bullish' : 'Bearish'}
                </Badge>
              </div>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Volume */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">24h Volume</span>
                  <span className="text-sm font-medium">
                    {priceData.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Timestamp */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-sm text-gray-600">Last Updated</span>
                  </div>
                  <span className="text-xs font-medium">
                    {formatTimestamp(priceData.timestamp)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};