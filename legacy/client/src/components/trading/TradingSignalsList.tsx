import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Brain, Clock } from 'lucide-react';
import { TradingSignal } from '../../types/trading';

interface TradingSignalsListProps {
  signals: TradingSignal[];
  loading: boolean;
}

export const TradingSignalsList: React.FC<TradingSignalsListProps> = ({
  signals,
  loading
}) => {
  if (loading) {
    return (
      <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Loading trading signals...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatPrice = (price: number) => {
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'LONG' ? (
      <TrendingUp className="w-4 h-4 text-green-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-600" />
    );
  };

  const getDirectionColor = (direction: string) => {
    return direction === 'LONG' ? 'text-green-600' : 'text-red-600';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 75) return 'text-green-600';
    if (confidence >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600" />
          <span className="text-lg font-semibold text-gray-800">Trading Signals History</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {signals.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No trading signals found</p>
            <p className="text-sm text-gray-500">Generate your first signal to see it here</p>
          </div>
        ) : (
          signals.map((signal) => (
            <div
              key={signal._id}
              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{signal.symbol}</span>
                  {getDirectionIcon(signal.direction)}
                  <span className={`font-medium ${getDirectionColor(signal.direction)}`}>
                    {signal.direction}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {signal.status || 'Active'}
                  </Badge>
                  <span className={`text-sm font-medium ${getConfidenceColor(signal.confidence)}`}>
                    {signal.confidence}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-500">Entry</p>
                  <p className="font-medium">${formatPrice(signal.entry)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">SL</p>
                  <p className="font-medium text-red-600">${formatPrice(signal.sl)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">TP</p>
                  <p className="font-medium text-green-600">${formatPrice(signal.tp)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>R/R: {signal.rr.toFixed(2)}</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(signal.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {signal.thoughts && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-700">
                  {signal.thoughts.substring(0, 100)}
                  {signal.thoughts.length > 100 && '...'}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};