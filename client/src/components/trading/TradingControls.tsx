import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Bot, Play, Zap, AlertTriangle, Clock, Copy } from 'lucide-react';
import { TradingConfig } from '../../types/trading';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

interface TradingControlsProps {
  config: TradingConfig;
  onConfigChange: (config: TradingConfig) => void;
  onGenerateSignal: () => void;
  onExecuteManual: (jsonSignal: string) => void;
  isGenerating: boolean;
  isExecuting: boolean;
}

const CRYPTO_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'DOGEUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'AXSUSDT',
  '1000PEPEUSDT',
  '1000SHIBUSDT',
  '1000BONKUSDT',
];

const TIMEFRAMES = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hours' },
  { value: '1d', label: '1 Day' },
];

export const TradingControls: React.FC<TradingControlsProps> = ({
  config,
  onConfigChange,
  onGenerateSignal,
  onExecuteManual,
  isGenerating,
  isExecuting
}) => {
  const [manualJson, setManualJson] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [chartPrompt, setChartPrompt] = useState<string | null>(null);
  const [isLoadingChart, setIsLoadingChart] = useState(false);

  const handleConfigUpdate = (key: keyof TradingConfig, value: any) => {
    onConfigChange({ ...config, [key]: value });
  };

  const handleExecuteManual = () => {
    if (manualJson.trim()) {
      onExecuteManual(manualJson);
      setManualJson('');
    }
  };

  const handleGenerateChartPrompt = async () => {
    setIsLoadingChart(true);
    setChartPrompt(null);
    try {
      const res = await fetch('/api/trading/chart-data-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: config.selectedSymbol,
          timeframes: config.selectedTimeframes,
        }),
      });
      const data = await res.json();
      setChartPrompt(data.prompt);
    } catch (e) {
      setChartPrompt('Failed to fetch chart data.');
    }
    setIsLoadingChart(false);
  };

  const selectedTimeframes = config.selectedTimeframes || ['15m', '1h', '4h', '1d'];

  return (
    <Card className="h-full bg-white/90 backdrop-blur-sm border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <Bot className="w-5 h-5 text-blue-600" />
          Trading Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cryptocurrency Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">Cryptocurrency</Label>
          <Select
            value={config.selectedSymbol}
            onValueChange={(value) => handleConfigUpdate('selectedSymbol', value)}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue placeholder="Select symbol" />
            </SelectTrigger>
            <SelectContent>
              {CRYPTO_SYMBOLS.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Timeframe Selection */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-600" />
            <Label className="text-sm font-medium text-gray-700">Analysis Timeframes</Label>
            <Badge variant="outline" className="text-xs">
              {selectedTimeframes.length} selected
            </Badge>
          </div>
          {/* Multi-select using ToggleGroup */}
          <ToggleGroup
            type="multiple"
            value={selectedTimeframes}
            onValueChange={(values: string[]) => handleConfigUpdate('selectedTimeframes', values)}
            className="flex flex-wrap gap-2"
          >
            {TIMEFRAMES.map((timeframe) => (
              <ToggleGroupItem
                key={timeframe.value}
                value={timeframe.value}
                className="px-3 py-1 rounded border border-gray-200 text-sm"
              >
                {timeframe.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="text-xs text-gray-500">
            Select multiple timeframes for comprehensive analysis
          </div>
        </div>

        <Separator />

        {/* Trading Mode Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-gray-700">Auto Mode</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={config.isAutoMode}
                onCheckedChange={(checked) => handleConfigUpdate('isAutoMode', checked)}
              />
              <Badge variant={config.isAutoMode ? "default" : "secondary"} className="text-xs">
                {config.isAutoMode ? 'ON' : 'OFF'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-gray-700">Environment</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={!config.isTestnet}
                onCheckedChange={(checked) => handleConfigUpdate('isTestnet', !checked)}
              />
              <Badge 
                variant={config.isTestnet ? "secondary" : "destructive"} 
                className="text-xs"
              >
                {config.isTestnet ? 'TESTNET' : 'LIVE'}
              </Badge>
              {!config.isTestnet && (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
            </div>
          </div>

          {/* <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-gray-700">Mock Mode</Label>
            <Switch
              checked={config.isMockMode}
              onCheckedChange={(checked) => handleConfigUpdate('isMockMode', checked)}
            />
          </div> */}
        </div>

        <Separator />

        {/* Confidence Threshold */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-gray-700">Confidence Threshold</Label>
            <Badge variant="outline" className="text-xs">
              {config.confidenceThreshold}%
            </Badge>
          </div>
          <Slider
            value={[config.confidenceThreshold]}
            onValueChange={([value]) => handleConfigUpdate('confidenceThreshold', value)}
            max={100}
            min={0}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <Separator />

        {/* AI Model Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">AI Model</Label>
          <Select
            value={config.aiModel}
            onValueChange={(value: 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4o') => handleConfigUpdate('aiModel', value)}
          >
            <SelectTrigger className="bg-white border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast)</SelectItem>
              <SelectItem value="gpt-4">GPT-4 (Enhanced)</SelectItem>
              <SelectItem value="gpt-4-turbo">GPT-4 Turbo (Optimized)</SelectItem>
              <SelectItem value="gpt-4o"> GPT-4o (Latest)</SelectItem>
              <SelectItem value="gpt-4o-mini">GPT-4o Mini (Compact)</SelectItem>
              <SelectItem value="gpt-4.1"> GPT-4.1 (Experimental)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={onGenerateSignal}
            disabled={isGenerating || config.isAutoMode}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Generate Signal
              </div>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowManualInput(!showManualInput)}
            className="w-full border-gray-300"
          >
            {showManualInput ? 'Hide' : 'Show'} Manual Input
          </Button>

          {showManualInput && (
            <div className="space-y-3">
              <Textarea
                placeholder="Paste trading signal JSON here..."
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                className="min-h-[100px] bg-white border-gray-200"
              />
              <Button
                onClick={handleExecuteManual}
                disabled={!manualJson.trim() || isExecuting}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isExecuting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Executing...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Execute Manual
                  </div>
                )}
              </Button>
            </div>
          )}

          {/* New button to generate and display chart data prompt */}
          <Button
            variant="outline"
            onClick={handleGenerateChartPrompt}
            disabled={isLoadingChart}
            className="w-full border-gray-300 mt-2"
          >
            {isLoadingChart ? 'Generating Chart Data...' : 'Show Chart Data Prompt'}
          </Button>
          {chartPrompt && (
            <div className="mt-4 p-3 bg-gray-50 rounded text-xs font-mono whitespace-pre overflow-x-auto max-h-96 relative">
              <button
                className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 transition"
                title="Copy chart data prompt"
                onClick={() => {
                  if (chartPrompt) {
                    navigator.clipboard.writeText(chartPrompt);
                  }
                }}
              >
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
              {chartPrompt}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};