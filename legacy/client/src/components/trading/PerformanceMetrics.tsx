import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { TrendingUp, TrendingDown, Target, Trophy, Zap, BarChart3 } from 'lucide-react';
import { PerformanceMetrics as PerformanceMetricsType } from '../../types/trading';

interface PerformanceMetricsProps {
  metrics: PerformanceMetricsType | null;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-600">Loading performance data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatPnL = (pnl: number | undefined | null) => {
    if (typeof pnl !== 'number' || isNaN(pnl)) return '$0.00';
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  };

  const formatPercentage = (percentage: number | undefined | null) => {
    if (typeof percentage !== 'number' || isNaN(percentage)) return '0.00%';
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  return (
    <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Performance Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily Performance */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Daily Performance</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                {metrics.dailyPnL >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
                <span className="text-xs font-medium text-gray-700">P&L</span>
              </div>
              <div className="space-y-1">
                <p className={`text-lg font-bold ${metrics.dailyPnL && metrics.dailyPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPnL(metrics.dailyPnL)}
                </p>
                <p className={`text-xs ${metrics.dailyPnLPercentage && metrics.dailyPnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(metrics.dailyPnLPercentage)}
                </p>
              </div>
            </div>

            <div className="p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium text-gray-700">Win Rate</span>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-purple-600">{typeof metrics.winRate === 'number' ? metrics.winRate.toFixed(1) : '0.0'}%</p>
                <Progress value={typeof metrics.winRate === 'number' ? metrics.winRate : 0} className="h-2" />
              </div>
            </div>
          </div>
        </div>

        {/* All-Time Performance */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">All-Time Performance</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4 text-green-600" />
                <span className="text-xs font-medium text-gray-700">Total P&L</span>
              </div>
              <div className="space-y-1">
                <p className={`text-lg font-bold ${metrics.allTimePnL && metrics.allTimePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPnL(metrics.allTimePnL)}
                </p>
                <p className={`text-xs ${metrics.allTimePnLPercentage && metrics.allTimePnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(metrics.allTimePnLPercentage)}
                </p>
              </div>
            </div>

            <div className="p-3 bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-medium text-gray-700">Total Trades</span>
              </div>
              <p className="text-lg font-bold text-orange-600">{metrics.totalTrades}</p>
            </div>
          </div>
        </div>

        {/* Streak Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Trading Streaks</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Zap className="w-3 h-3 text-yellow-600" />
                <span className="text-xs font-medium text-gray-700">Current</span>
              </div>
              <p className="text-sm font-bold text-yellow-600">{metrics.currentStreak}</p>
              <Badge
                variant={metrics.currentStreakType === 'win' ? "default" : "destructive"}
                className="text-xs mt-1"
              >
                {metrics.currentStreakType}
              </Badge>
            </div>

            <div className="p-3 bg-green-50 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-xs font-medium text-gray-700">Best Win</span>
              </div>
              <p className="text-sm font-bold text-green-600">{metrics.winStreak}</p>
            </div>

            <div className="p-3 bg-red-50 rounded-lg text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-xs font-medium text-gray-700">Worst Loss</span>
              </div>
              <p className="text-sm font-bold text-red-600">{metrics.lossStreak}</p>
            </div>
          </div>
        </div>

        {/* Performance Summary */}
        <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Stats</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Avg. Win:</span>
              <span className="font-medium text-green-600">
                {metrics.totalTrades > 0 
                  ? `$${(metrics.allTimePnL / (metrics.totalTrades * metrics.winRate / 100)).toFixed(2)}`
                  : '$0.00'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg. Loss:</span>
              <span className="font-medium text-red-600">
                {metrics.totalTrades > 0 
                  ? `$${(Math.abs(metrics.allTimePnL) / (metrics.totalTrades * (100 - metrics.winRate) / 100)).toFixed(2)}`
                  : '$0.00'
                }
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Profit Factor:</span>
              <span className="font-medium text-blue-600">
                {metrics.winRate > 0 ? (metrics.winRate / (100 - metrics.winRate)).toFixed(2) : '0.00'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Sharpe Ratio:</span>
              <span className="font-medium text-purple-600">
                {(metrics.allTimePnLPercentage / 10).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};