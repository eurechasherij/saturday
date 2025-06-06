import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Wifi, WifiOff, TrendingUp, TrendingDown, DollarSign, Clock, Brain, X } from 'lucide-react';
import { Position, Transaction, ConnectionStatus, TradingSignal } from '../../types/trading';
import { closePosition, getCurrentPrice, getUsdtBalance } from '../../api/trading';
import { useToast } from '../../hooks/useToast';

interface LiveInformationProps {
  positions: Position[];
  transactions: Transaction[];
  connectionStatus: ConnectionStatus;
  signals?: TradingSignal[];
  onPositionClosed?: () => void;
}

export const LiveInformation: React.FC<LiveInformationProps> = ({
  positions,
  transactions,
  connectionStatus,
  signals = [],
  onPositionClosed
}) => {
  const { toast } = useToast();
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [closePrice, setClosePrice] = useState<string>('');
  const [isClosing, setIsClosing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [usdtBalance, setUsdtBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Filter positions by status
  const openPositions = positions.filter(position => position.status === 'Open');
  const closedPositions = positions.filter(position => position.status === 'Closed');

  console.log('LiveInformation: Total positions:', positions.length);
  console.log('LiveInformation: Open positions:', openPositions.length);
  console.log('LiveInformation: Closed positions:', closedPositions.length);

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };

  const getStatusColor = (status: boolean) => {
    return status ? 'text-green-600' : 'text-red-600';
  };

  const formatPrice = (price: number) => {
    return price < 1 ? price.toFixed(6) : price.toFixed(2);
  };

  const handlePositionClick = async (position: Position) => {
    console.log('LiveInformation: Position clicked:', position);

    if (position.status !== 'Open') {
      console.log('LiveInformation: Position is not open, status:', position.status);
      toast({
        title: "Position Already Closed",
        description: "This position has already been closed.",
        variant: "destructive",
      });
      return;
    }

    setSelectedPosition(position);

    // Try to get current price as suggested close price
    try {
      const priceData = await getCurrentPrice(position.symbol);
      setClosePrice(priceData.price.toString());
      console.log('LiveInformation: Set close price to current price:', priceData.price);
    } catch (error) {
      console.error('LiveInformation: Failed to get current price:', error);
      setClosePrice(position.currentPrice?.toString() || position.entryPrice.toString());
    }

    setIsModalOpen(true);
    console.log('LiveInformation: Modal opened for position:', position._id);
  };

  const handleClosePosition = async () => {
    if (!selectedPosition || !closePrice) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid close price.",
        variant: "destructive",
      });
      return;
    }

    const closePriceNum = parseFloat(closePrice);
    if (isNaN(closePriceNum) || closePriceNum <= 0) {
      toast({
        title: "Invalid Price",
        description: "Please enter a valid positive number for close price.",
        variant: "destructive",
      });
      return;
    }

    setIsClosing(true);
    console.log('LiveInformation: Closing position:', selectedPosition._id, 'at price:', closePriceNum);

    try {
      const response = await closePosition(selectedPosition._id, { closePrice: closePriceNum });

      if (response.success) {
        toast({
          title: "Position Closed",
          description: `Successfully closed ${selectedPosition.direction} position for ${selectedPosition.symbol} with PnL: ${response.position.pnl.toFixed(2)}`,
        });

        setIsModalOpen(false);
        setSelectedPosition(null);
        setClosePrice('');

        // Trigger refresh of positions data
        if (onPositionClosed) {
          onPositionClosed();
        }

        console.log('LiveInformation: Position closed successfully');
      } else {
        throw new Error('Failed to close position');
      }
    } catch (error) {
      console.error('LiveInformation: Error closing position:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to close position",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  const handleModalClose = () => {
    console.log('LiveInformation: Modal closed');
    setIsModalOpen(false);
    setSelectedPosition(null);
    setClosePrice('');
    setIsClosing(false);
  };

  React.useEffect(() => {
    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        const res = await getUsdtBalance();
        setUsdtBalance(res.usdtBalance);
      } catch (e) {
        setUsdtBalance(null);
      } finally {
        setLoadingBalance(false);
      }
    };
    fetchBalance();
  }, []);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-800">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(connectionStatus.binance)}
              <span className="text-sm text-gray-700">Binance</span>
            </div>
            <span className={`text-xs font-medium ${getStatusColor(connectionStatus.binance)}`}>
              {connectionStatus.binance ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(connectionStatus.openai)}
              <span className="text-sm text-gray-700">OpenAI</span>
            </div>
            <span className={`text-xs font-medium ${getStatusColor(connectionStatus.openai)}`}>
              {connectionStatus.openai ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(connectionStatus.database)}
              <span className="text-sm text-gray-700">Database</span>
            </div>
            <span className={`text-xs font-medium ${getStatusColor(connectionStatus.database)}`}>
              {connectionStatus.database ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {/* Real USDT Balance */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">USDT Balance</span>
            <span className="text-xs font-bold text-blue-700">
              {loadingBalance ? 'Loading...' : usdtBalance !== null ? `$${usdtBalance.toFixed(2)}` : 'N/A'}
            </span>
          </div>

          {/* Add timestamp display */}
          {connectionStatus.lastChecked && (
            <>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-xs text-gray-600">Last Checked</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(connectionStatus.lastChecked).toLocaleString()}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Open Positions */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-800">
            Open Positions ({openPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-32">
            {openPositions.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No open positions</p>
            ) : (
              <div className="space-y-2">
                {openPositions.map((position) => (
                  <div
                    key={position._id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handlePositionClick(position)}
                  >
                    <div className="flex items-center gap-2">
                      {position.direction === 'LONG' ? (
                        <TrendingUp className="w-3 h-3 text-green-600" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-600" />
                      )}
                      <span className="text-xs font-medium">{position.symbol}</span>
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {position.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${position.pnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">{position.pnlPercentage.toFixed(2)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Closed Positions */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-800">
            Closed Positions ({closedPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-32">
            {closedPositions.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No closed positions</p>
            ) : (
              <div className="space-y-2">
                {closedPositions.slice(0, 10).map((position) => (
                  <div
                    key={position._id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded opacity-75"
                  >
                    <div className="flex items-center gap-2">
                      {position.direction === 'LONG' ? (
                        <TrendingUp className="w-3 h-3 text-green-600" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-600" />
                      )}
                      <span className="text-xs font-medium">{position.symbol}</span>
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        {position.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${position.pnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">{position.pnlPercentage.toFixed(2)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Signals */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-600" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            {signals.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No signals generated</p>
            ) : (
              <div className="space-y-2">
                {signals.slice(0, 5).map((signal) => (
                  <div key={signal._id} className="p-2 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {signal.direction === 'LONG' ? (
                          <TrendingUp className="w-3 h-3 text-green-600" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-600" />
                        )}
                        <span className="text-xs font-medium">{signal.symbol}</span>
                      </div>
                      <span className="text-xs text-purple-600 font-medium">
                        {signal.confidence}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Entry: ${formatPrice(signal.entry)}</span>
                      <span>{new Date(signal.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="bg-white/90 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-800">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-40">
            {transactions.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-4">No recent transactions</p>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 10).map((transaction) => (
                  <div key={transaction._id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3 h-3 text-blue-600" />
                      <div>
                        <p className="text-xs font-medium">{transaction.symbol}</p>
                        <p className="text-xs text-gray-500">{transaction.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={transaction.status === 'Success' ? 'default' : transaction.status === 'Failed' ? 'destructive' : 'secondary'}
                        className="text-xs mb-1"
                      >
                        {transaction.status}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(transaction.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Close Position Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              Close Position
              <Button
                variant="ghost"
                size="sm"
                onClick={handleModalClose}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {selectedPosition && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    {selectedPosition.direction} {selectedPosition.symbol}
                  </span>
                  <span className={`text-sm font-semibold ${selectedPosition.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${selectedPosition.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>Entry: ${formatPrice(selectedPosition.entryPrice)}</div>
                  <div>Size: {selectedPosition.size}</div>
                  <div>Leverage: {selectedPosition.leverage}x</div>
                  <div>Current: ${formatPrice(selectedPosition.currentPrice || selectedPosition.entryPrice)}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="closePrice">Close Price</Label>
                <Input
                  id="closePrice"
                  type="number"
                  step="0.000001"
                  value={closePrice}
                  onChange={(e) => setClosePrice(e.target.value)}
                  placeholder="Enter close price"
                  disabled={isClosing}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={handleModalClose}
                  className="flex-1"
                  disabled={isClosing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleClosePosition}
                  className="flex-1"
                  disabled={isClosing || !closePrice}
                >
                  {isClosing ? "Closing..." : "Close Position"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};