import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Separator } from '../ui/separator';
import { TrendingUp, TrendingDown, Target, Shield, DollarSign, Brain, Clock, Play } from 'lucide-react';
import { TradingSignal } from '../../types/trading';
import { usePriceData } from '../../hooks/usePriceData';

interface SignalDisplayProps {
  signal: TradingSignal | null;
  onExecute: () => void;
  isExecuting: boolean;
  isLoading: boolean;
}

export const SignalDisplay: React.FC<SignalDisplayProps> = ({
  signal,
  onExecute,
  isExecuting,
  isLoading
}) => {
  const { price: currentPrice } = usePriceData(signal?.symbol || '');

  if (isLoading) {
    return (
      <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Generating AI signal...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!signal) {
    return (
      <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <Brain className="w-16 h-16 text-gray-400 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-gray-800">No Signal Generated</h3>
              <p className="text-gray-600">Click "Generate Signal" to get AI analysis</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getDirectionIcon = () => {
    return signal.direction === 'LONG' ? (
      <TrendingUp className="w-6 h-6 text-green-600" />
    ) : (
      <TrendingDown className="w-6 h-6 text-red-600" />
    );
  };

  const getDirectionColor = () => {
    return signal.direction === 'LONG' ? 'text-green-600' : 'text-red-600';
  };

  const getConfidenceColor = () => {
    if (signal.confidence >= 75) return 'text-green-600';
    if (signal.confidence >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatPrice = (price: number) => {
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  return (
    <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span className="text-lg font-semibold text-gray-800">AI Trading Signal</span>
          </div>
          <Badge
            variant={signal.status === 'Active' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {signal.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Symbol and Direction */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <h2 className="text-2xl font-bold text-gray-800">{signal.symbol}</h2>
            <div className="flex items-center gap-1">
              {getDirectionIcon()}
              <span className={`text-xl font-bold ${getDirectionColor()}`}>
                {signal.direction}
              </span>
            </div>
          </div>
          {currentPrice > 0 && (
            <p className="text-sm text-gray-600">
              Current Price: ${formatPrice(currentPrice)}
            </p>
          )}
        </div>

        <Separator />

        {/* Trading Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Entry</span>
              </div>
              <span className="font-semibold text-gray-800">${formatPrice(signal.entry)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-gray-700">Stop Loss</span>
              </div>
              <span className="font-semibold text-gray-800">${formatPrice(signal.sl)}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Take Profit</span>
              </div>
              <span className="font-semibold text-gray-800">${formatPrice(signal.tp)}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">R/R Ratio</span>
              </div>
              <span className="font-semibold text-gray-800">{signal.rr.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Confidence Level</span>
            <span className={`font-bold ${getConfidenceColor()}`}>
              {signal.confidence}%
            </span>
          </div>
          <Progress value={signal.confidence} className="h-3" />
        </div>

        <Separator />

        {/* AI Thoughts */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">AI Analysis</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700 leading-relaxed">{signal.thoughts}</p>
          </div>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Generated: {new Date(signal.timestamp).toLocaleString()}</span>
        </div>

        {/* Execute Button */}
        <Button
          onClick={onExecute}
          disabled={isExecuting || signal.status === 'Executed'}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
        >
          {isExecuting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Executing Trade...
            </div>
          ) : signal.status === 'Executed' ? (
            'Trade Executed'
          ) : (
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Execute Trade
            </div>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};