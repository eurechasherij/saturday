import React, { useState } from 'react';
import { TradingControls } from '../components/trading/TradingControls';
import { SignalDisplay } from '../components/trading/SignalDisplay';
import { LiveInformation } from '../components/trading/LiveInformation';
import { PerformanceMetrics } from '../components/trading/PerformanceMetrics';
import { RealTimePriceDisplay } from '../components/trading/RealTimePriceDisplay';
import { TradingSignal, TradingConfig } from '../types/trading';
import { useTradingData } from '../hooks/useTradingData';
import { generateTradingSignal, executeTrade, executeManualSignal } from '../api/trading';
import { useToast } from '../hooks/useToast';

export const Dashboard: React.FC = () => {
  const { toast } = useToast();
  const { positions, transactions, metrics, connectionStatus, tradingSignals, loading, refetch } = useTradingData();

  const [config, setConfig] = useState<TradingConfig>({
    selectedSymbol: 'BTCUSDT',
    isAutoMode: false,
    isTestnet: true,
    confidenceThreshold: 75,
    aiModel: 'gpt-3.5-turbo',
    isMockMode: true,
    selectedTimeframes: ['15m', '1h', '4h']
  });

  const [currentSignal, setCurrentSignal] = useState<TradingSignal | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleGenerateSignal = async () => {
    setIsGenerating(true);
    try {
      const response = await generateTradingSignal({
        symbol: config.selectedSymbol,
        model: config.aiModel,
        timeframes: config.selectedTimeframes
      });
      setCurrentSignal(response.signal);
      toast({
        title: "Signal Generated",
        description: `New ${response.signal.direction} signal for ${response.signal.symbol} with ${response.signal.confidence}% confidence`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate trading signal",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecuteTrade = async () => {
    if (!currentSignal) return;

    setIsExecuting(true);
    try {
      const response = await executeTrade({
        signal: currentSignal,
        isTestnet: config.isTestnet
      });

      if (response.success) {
        setCurrentSignal({ ...currentSignal, status: 'Executed' });
        toast({
          title: "Trade Executed",
          description: `Successfully executed ${currentSignal.direction} trade for ${currentSignal.symbol}`,
        });
      } else {
        throw new Error('Trade execution failed');
      }
    } catch (error) {
      toast({
        title: "Execution Failed",
        description: error instanceof Error ? error.message : "Failed to execute trade",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleManualExecution = async (jsonSignal: string) => {
    setIsExecuting(true);
    try {
      const response = await executeManualSignal({
        signalJson: jsonSignal,
        isTestnet: config.isTestnet
      });

      if (response.success) {
        setCurrentSignal(response.signal);
        toast({
          title: "Manual Trade Executed",
          description: `Successfully executed manual ${response.signal.direction} trade for ${response.signal.symbol}`,
        });
      } else {
        throw new Error('Invalid JSON signal format');
      }
    } catch (error) {
      toast({
        title: "Manual Execution Failed",
        description: error instanceof Error ? error.message : "Failed to execute manual trade",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePositionClosed = () => {
    console.log('Dashboard: Position closed, refreshing data');
    refetch();
  };

  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center h-screen">
  //       <div className="text-center space-y-4">
  //         <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
  //         <p className="text-gray-600">Loading trading dashboard...</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto p-6 space-y-6">
        {/* Main Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Panel - Trading Controls */}
          <div className="lg:col-span-1">
            <TradingControls
              config={config}
              onConfigChange={setConfig}
              onGenerateSignal={handleGenerateSignal}
              onExecuteManual={handleManualExecution}
              isGenerating={isGenerating}
              isExecuting={isExecuting}
            />
          </div>

          {/* Center Panel - Signal Display */}
          <div className="lg:col-span-2">
            <SignalDisplay
              signal={currentSignal}
              onExecute={handleExecuteTrade}
              isExecuting={isExecuting}
              isLoading={isGenerating}
            />
          </div>

          {/* Right Panel - Live Information */}
          <div className="lg:col-span-1">
            <LiveInformation
              positions={positions}
              transactions={transactions}
              connectionStatus={connectionStatus}
              signals={tradingSignals}
              onPositionClosed={handlePositionClosed}
            />
          </div>
        </div>

        {/* Real-Time Price Data Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <RealTimePriceDisplay />
          </div>

          {/* Performance Metrics Panel */}
          <div>
            <PerformanceMetrics metrics={metrics} />
          </div>
        </div>
      </div>
    </div>
  );
};