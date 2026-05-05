package services

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"saturday-autotrade/config"
	"saturday-autotrade/models"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type TradingService struct {
	llmService            *LLMService
	binanceService        *BinanceService
	collection            *mongo.Collection
	positionCollection    *mongo.Collection
	transactionCollection *mongo.Collection
}

func NewTradingService() *TradingService {

	return &TradingService{
		llmService:            NewLLMService(),
		binanceService:        NewBinanceService(),
		collection:            config.DB.Collection("trading_signals"),
		positionCollection:    config.DB.Collection("positions"),
		transactionCollection: config.DB.Collection("transactions"),
	}
}

// ExecuteTrade executes a trading signal on Binance Futures
func (s *TradingService) ExecuteTrade(signal *models.TradingSignal, isTestnet bool) (*models.ExecuteTradeResponse, error) {

	// Check if signal is already executed
	if signal.Status == "Executed" || signal.Status == "executed" {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "Signal is already executed",
		}, fmt.Errorf("signal is already executed")
	}

	// Execute trade using real Binance API
	executionResult, err := s.executeBinanceTrade(signal, isTestnet)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Trade execution failed: %v", err),
		}, err
	}

	if !executionResult.Success {
		return executionResult, fmt.Errorf("trade execution failed: %s", executionResult.Message)
	}

	// Get current price for position creation
	currentPrice, err := s.binanceService.GetPrice(signal.Symbol)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "Failed to get current price for position creation",
		}, fmt.Errorf("failed to get current price: %w", err)
	}

	// Create position record when trade is executed successfully
	positionReq := &models.CreatePositionRequest{
		Symbol:     signal.Symbol,
		Direction:  signal.Direction,
		Size:       1.0,
		EntryPrice: signal.Entry,
		Leverage:   signal.Leverage,
		IsTestnet:  isTestnet,
		StopLoss:   signal.SL,
		TakeProfit: signal.TP,
	}

	position, err := s.CreatePosition(positionReq)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "Failed to get current price for position creation",
		}, fmt.Errorf("failed to get current price: %w", err)
	}

	// Create transaction record for the executed trade
	transactionType := "BUY"
	if signal.Direction == "SHORT" {
		transactionType = "SELL"
	}

	description := fmt.Sprintf("%s %s position opened via AI signal", signal.Direction, signal.Symbol)
	positionIDString := ""
	if position != nil {
		positionIDString = position.ID.Hex()
	}

	transactionReq := &models.CreateTransactionRequest{
		Symbol:      signal.Symbol,
		Type:        transactionType,
		Amount:      1.0, // Default trade size
		Price:       signal.Entry,
		Status:      "Success",
		PnL:         0.0, // Initial PnL is 0
		PositionID:  positionIDString,
		SignalID:    signal.ID.Hex(),
		IsTestnet:   isTestnet,
		OrderID:     executionResult.TransactionId,
		Description: description,
	}

	// transaction, err := s.CreateTransaction(transactionReq)
	transaction, err := s.CreateTransaction(transactionReq)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "Failed to create transaction record",
		}, err
	}
	// transaction is intentionally unused, so ignore it
	_ = transaction

	// Update signal in database with execution details
	now := time.Now()
	executionPrice := signal.Entry
	if currentPrice != nil {
		executionPrice = currentPrice.Price
	}

	updateData := bson.M{
		"$set": bson.M{
			"status":         "Executed",
			"executedAt":     now,
			"transactionId":  executionResult.TransactionId,
			"executionPrice": executionPrice,
			"isTestnet":      isTestnet,
			"updatedAt":      now,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = s.collection.UpdateOne(ctx, bson.M{"_id": signal.ID}, updateData)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "Failed to update signal status",
		}, fmt.Errorf("failed to update signal: %w", err)
	}

	return executionResult, nil
}

// executeBinanceTrade executes a trade using real Binance API

func (s *TradingService) executeBinanceTrade(signal *models.TradingSignal, isTestnet bool) (*models.ExecuteTradeResponse, error) {

	// Initialize Binance Futures service
	futuresService := NewBinanceFuturesService(isTestnet)

	// Check if API is configured, fall back to mock if not
	if !futuresService.IsConfigured() {
		return s.mockTradeExecution(signal, isTestnet), nil
	}

	// Set leverage for the symbol
	_, err := futuresService.SetLeverage(signal.Symbol, signal.Leverage)
	if err != nil {
		// Continue anyway, leverage might already be set
	}

	const riskPercent = 0.2 // 20% risk per trade

	accountInfo, err := futuresService.GetAccountInfo()
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to get account info for margin validation: %v", err),
		}, err
	}
	var availableBalance float64
	for _, asset := range accountInfo.Assets {
		if asset.Asset == "USDT" {
			availableBalance, _ = strconv.ParseFloat(asset.AvailableBalance, 64)
			break
		}
	}
	if availableBalance <= 0 {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: "No available USDT balance",
		}, fmt.Errorf("no available USDT balance")
	}

	riskAmount := availableBalance * riskPercent
	positionSize := riskAmount * float64(signal.Leverage)
	tradeQuantity := positionSize / signal.Entry

	// Fetch stepSize and minQty for the symbol
	stepSize, minQty, err := futuresService.GetSymbolStepSizeAndMinQty(signal.Symbol)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to get step size: %v", err),
		}, err
	}
	tradeQuantity = TruncateToStepSize(tradeQuantity, stepSize)

	if tradeQuantity < minQty {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Trade quantity %.8f is less than the minimum allowed %.8f for %s", tradeQuantity, minQty, signal.Symbol),
		}, fmt.Errorf("trade quantity %.8f is less than minQty %.8f", tradeQuantity, minQty)
	}

	// // Calculate trade quantity (for demo, using a small fixed amount)
	// tradeQuantity := 0.001 // Small amount for testing
	// if signal.Symbol == "DOGEUSDT" || signal.Symbol == "ADAUSDT" {
	// 	tradeQuantity = 100.0 // Higher quantity for lower-priced tokens
	// }

	// Validate margin and balance
	err = futuresService.ValidateMarginAndBalance(signal.Symbol, tradeQuantity, signal.Entry, signal.Leverage)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Insufficient balance: %v", err),
		}, err
	}

	// Determine order side based on signal direction
	orderSide := "BUY"
	positionSide := "LONG"
	if signal.Direction == "SHORT" {
		orderSide = "SELL"
		positionSide = "SHORT"
	}

	positionSide = "BOTH" // Use BOTH for dual-side positions in Binance Futures

	// Create main order (market order for immediate execution)
	mainOrderReq := &OrderRequest{
		Symbol:       signal.Symbol,
		Side:         orderSide,
		PositionSide: positionSide,
		Type:         "MARKET",
		Quantity:     tradeQuantity,
	}

	mainOrder, err := futuresService.PlaceOrder(mainOrderReq)
	if err != nil {
		return &models.ExecuteTradeResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to place main order: %v", err),
		}, err
	}

	// Place stop-loss order
	stopSide := "SELL"
	if signal.Direction == "SHORT" {
		stopSide = "BUY"
	}

	stopOrderReq := &OrderRequest{
		Symbol:       signal.Symbol,
		Side:         stopSide,
		PositionSide: positionSide,
		Type:         "STOP_MARKET",
		Quantity:     tradeQuantity,
		StopPrice:    signal.SL,
		ReduceOnly:   true,
		WorkingType:  "MARK_PRICE",
		TimeInForce:  "GTE_GTC",
	}

	stopOrder, err := futuresService.PlaceOrder(stopOrderReq)
	if err != nil {
		// log.Printf("TradingService: Failed to place stop-loss order: %v", err)
		// log.Printf("TradingService: Continuing without stop-loss order")
	} else {
		// log.Printf("TradingService: Stop-loss order placed successfully - OrderID: %d", stopOrder.OrderID)
	}
	_ = stopOrder

	// Place take-profit order
	takeProfitOrderReq := &OrderRequest{
		Symbol:       signal.Symbol,
		Side:         stopSide, // Same side as stop-loss
		PositionSide: positionSide,
		Type:         "TAKE_PROFIT_MARKET",
		Quantity:     tradeQuantity,
		StopPrice:    signal.TP,
		ReduceOnly:   true,
		WorkingType:  "MARK_PRICE",
		TimeInForce:  "GTE_GTC",
	}

	takeProfitOrder, err := futuresService.PlaceOrder(takeProfitOrderReq)
	if err != nil {
		// log.Printf("TradingService: Failed to place take-profit order: %v", err)
		// log.Printf("TradingService: Continuing without take-profit order")
	} else {
		// log.Printf("TradingService: Take-profit order placed successfully - OrderID: %d", takeProfitOrder.OrderID)
	}
	_ = takeProfitOrder

	// Create transaction ID that includes main order ID
	transactionId := fmt.Sprintf("%s_%d_%s",
		map[bool]string{true: "testnet", false: "live"}[isTestnet],
		mainOrder.OrderID,
		signal.ID.Hex()[:8])

	successMessage := fmt.Sprintf("Successfully executed %s trade for %s - OrderID: %d",
		signal.Direction, signal.Symbol, mainOrder.OrderID)

	return &models.ExecuteTradeResponse{
		Success:       true,
		Message:       successMessage,
		TransactionId: transactionId,
	}, nil
}

// mockTradeExecution simulates trade execution

func (s *TradingService) mockTradeExecution(signal *models.TradingSignal, isTestnet bool) *models.ExecuteTradeResponse {

	// Simulate a 90% success rate
	success := rand.Float32() > 0.1

	transactionId := fmt.Sprintf("%s_%d_%s",
		map[bool]string{true: "testnet", false: "live"}[isTestnet],
		time.Now().Unix(),
		signal.ID.Hex()[:8])

	response := &models.ExecuteTradeResponse{
		Success:       success,
		TransactionId: transactionId,
	}

	if success {
		response.Message = fmt.Sprintf("Successfully executed %s trade for %s", signal.Direction, signal.Symbol)
	} else {
		response.Message = "Insufficient margin or market conditions unfavorable"
	}

	return response
}

// GetBinancePrice fetches current price from Binance

func (s *TradingService) GetBinancePrice(symbol string) (*BinancePriceResponse, error) {

	return s.binanceService.GetPrice(symbol)
}

// SaveTradingSignal saves a trading signal to the database

func (s *TradingService) SaveTradingSignal(signal *models.TradingSignal) error {

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	signal.CreatedAt = time.Now()
	signal.UpdatedAt = time.Now()

	_, err := s.collection.InsertOne(ctx, signal)
	if err != nil {
		return fmt.Errorf("failed to save trading signal: %w", err)
	}

	return nil
}

// GetTradingSignals retrieves trading signals from the database

func (s *TradingService) GetTradingSignals(limit int) ([]models.TradingSignal, error) {

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Find()
	opts.SetSort(bson.D{{Key: "createdAt", Value: -1}})
	opts.SetLimit(int64(limit))

	cursor, err := s.collection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve trading signals: %w", err)
	}
	defer cursor.Close(ctx)

	var signals []models.TradingSignal
	if err = cursor.All(ctx, &signals); err != nil {
		return nil, fmt.Errorf("failed to decode trading signals: %w", err)
	}

	return signals, nil
}

// GetTradingSignalByID retrieves a trading signal by ID

func (s *TradingService) GetTradingSignalByID(id string) (*models.TradingSignal, error) {

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("invalid signal ID format: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var signal models.TradingSignal
	err = s.collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&signal)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("trading signal not found")
		}
		return nil, fmt.Errorf("failed to retrieve trading signal: %w", err)
	}

	return &signal, nil
}

// GenerateTradingSignalFromAI generates a trading signal using AI

func (s *TradingService) GenerateTradingSignalFromAI(symbol, model string, selectedTimeframes []string) (*models.TradingSignal, error) {
	marketData := make(map[string][]Kline)
	for _, tf := range selectedTimeframes {
		klines, err := s.binanceService.GetKlines(symbol, tf, 70)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch market data for %s: %w", tf, err)
		}
		marketData[tf] = klines
	}

	allCandles := map[string][]Kline{}
	for _, tf := range selectedTimeframes {
		if arr, ok := marketData[tf]; ok {
			// Calculate indicators **in place**
			CalculateRSI(arr, 14)
			CalculateMACD(arr)
			CalculateOBV(arr)
			allCandles[tf] = arr
		}
	}

	candles := map[string][]Kline{}
	for tf, tfCandles := range allCandles {
		n := 35
		if len(tfCandles) > n {
			candles[tf] = tfCandles[len(tfCandles)-n:]
		}
	}

	currentPrice, err := s.binanceService.GetPrice(symbol)
	if err != nil {
		currentPrice = &BinancePriceResponse{Price: 0}
	}

	if currentPrice == nil || currentPrice.Price <= 0 {
		return nil, fmt.Errorf("failed to fetch current price for %s", symbol)
	}

	price := currentPrice.Price

	// Run the three agent LLM calls in parallel
	type agentResult struct {
		resp string
		err  error
	}
	trendCh := make(chan agentResult, 1)
	reversalCh := make(chan agentResult, 1)
	volumeCh := make(chan agentResult, 1)

	go func() {
		resp, err := CallTrendAgent(s.llmService, symbol, price, candles, model)
		trendCh <- agentResult{resp, err}
	}()
	go func() {
		resp, err := CallReversalAgent(s.llmService, symbol, price, candles, model)
		reversalCh <- agentResult{resp, err}
	}()
	go func() {
		resp, err := CallVolumeAgent(s.llmService, symbol, price, candles, model)
		volumeCh <- agentResult{resp, err}
	}()

	var trendResp, reversalResp, volumeResp string
	for i := 0; i < 3; i++ {
		select {
		case res := <-trendCh:
			if res.err != nil {
				return nil, fmt.Errorf("trend agent error: %w", res.err)
			}
			trendResp = res.resp
		case res := <-reversalCh:
			if res.err != nil {
				return nil, fmt.Errorf("reversal agent error: %w", res.err)
			}
			reversalResp = res.resp
		case res := <-volumeCh:
			if res.err != nil {
				return nil, fmt.Errorf("volume agent error: %w", res.err)
			}
			volumeResp = res.resp
		}
	}

	// Aggregate with meta-agent (after all three are done)
	metaResp, err := CallMetaAgent(s.llmService, trendResp, reversalResp, volumeResp, model)
	if err != nil {
		return nil, fmt.Errorf("meta agent error: %w", err)
	}

	signal, err := s.parseAIResponse(metaResp)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	signal.ID = primitive.NewObjectID()
	signal.Model = model
	signal.Status = "Active"
	signal.Leverage = 20 // Default leverage
	signal.Timestamp = time.Now()
	signal.TimeframesAnalyzed = selectedTimeframes

	return signal, nil
}

func buildAgentPromptCommon(currentPrice float64, candles map[string][]Kline) string {
	prompt := "current_price: " + strconv.FormatFloat(currentPrice, 'f', 6, 64) + "\n\n"
	for tf, tfCandles := range candles {
		n := 35
		if len(tfCandles) > n {
			tfCandles = tfCandles[len(tfCandles)-n:]
		}
		prompt += fmt.Sprintf("Market Data (%s, last %d candles):\n\n", tf, len(tfCandles))
		for i, candle := range tfCandles {
			prompt += fmt.Sprintf("Candle %d: OpenTime: %d, Open: %.6f, High: %.6f, Low: %.6f, Close: %.6f, Volume: %.2f, Trades: %d, RSI: %.2f, MACD: %.5f, OBV: %.0f\n",
				i+1, candle.OpenTime, candle.Open, candle.High, candle.Low, candle.Close, candle.Volume, candle.NumberOfTrades, candle.RSI, candle.MACD, candle.OBV)
		}
		prompt += "\n"
	}
	prompt += `
Output ONLY valid, well-formatted JSON in this structure, DON'T USE MARKDOWN OR ANY OTHER FORMAT:
{
  "symbol": "{{symbol}}",
  "direction": "LONG" or "SHORT",
  "entry": <entry_price_number>,
  "sl": <stop_loss_price_number>,
  "tp": <take_profit_price_number>,
  "rr": <risk_reward_ratio_number>,
  "confidence": <confidence_0_to_100>,
  "thoughts": "<Detailed, structured technical analysis and reasoning for this trade recommendation>"
}


Rules:
- DON'T USE MARKDOWN OR ANY OTHER FORMAT
- DO NOT use any markdown, backticks, or code fences. Output only valid JSON without any markdown.
- All string values must escape newlines as \\n (not raw line breaks). Do not use raw line breaks inside any string values. JSON must be strict and Go-compatible.
- Only one direction per signal—never mention both LONG and SHORT at once.
- Use realistic price levels based on the latest market data you received.
- Do not use placeholder values like 0 or 1000; all prices must be realistic.
- ENTRY price must *exactly* equal the provided "current_price" value. Do not adjust or use any other value.
- SL and TP must be set according to recent candle data: use the most recent swing high/low, or clearly-identified support/resistance in the provided timeframe data.
- If SL/TP placement is ambiguous, default to a volatility-based method: use 1x ATR (calculated from the last 14 candles) away from ENTRY.
- DO NOT invent numbers for SL or TP. They must be justified by visible structure, recent price action, or volatility.
- For each, explain the logic in "thoughts": reference the exact candle(s) or structure used.
- TP must be above ENTRY for LONG, below ENTRY for SHORT; SL must be below ENTRY for LONG, above ENTRY for SHORT.
- If you cannot confidently justify SL or TP with the data provided, confidence must be 0 and you must explain why in "thoughts."
- SL must be below entry for LONG, above entry for SHORT; TP must be above entry for LONG, below entry for SHORT.
- RR = (TP-Entry)/(Entry-SL) for LONG, (Entry-TP)/(SL-Entry) for SHORT.
- Confidence must be based on your analysis, an integer between 0 and 100. Never use a percentage. Don't lie about confidence level.
- Confidence must be a realistic assessment of the trade setup, not just a random number. It's important to be honest about your confidence level.
- Thoughts must be a detailed, structured analysis of the market conditions, not just a summary.
- Never recommend coins with poor liquidity or excessive risk without clear reason.
- Multi-timeframe logic is required.
- **If no valid setup exists, fill all prices with 0, set confidence to 0, and in "thoughts" explain clearly why there is no valid trade setup right now. Direction must still be "LONG" or "SHORT" (pick the most probable, but never use "NONE").**

`
	return prompt
}

// parseAIResponse parses the AI (meta-agent) JSON output into a TradingSignal struct
func (s *TradingService) parseAIResponse(aiResponse string) (*models.TradingSignal, error) {
	var parsed struct {
		Symbol     string  `json:"symbol"`
		Direction  string  `json:"direction"`
		Entry      float64 `json:"entry"`
		SL         float64 `json:"sl"`
		TP         float64 `json:"tp"`
		RR         float64 `json:"rr"`
		Confidence int     `json:"confidence"`
		Thoughts   string  `json:"thoughts"`
	}
	// Try to unmarshal the response
	err := json.Unmarshal([]byte(aiResponse), &parsed)
	if err != nil {
		return nil, fmt.Errorf("failed to parse AI response JSON: %w\nRaw: %s", err, aiResponse)
	}

	return &models.TradingSignal{
		Symbol:     parsed.Symbol,
		Direction:  parsed.Direction,
		Entry:      parsed.Entry,
		SL:         parsed.SL,
		TP:         parsed.TP,
		RR:         parsed.RR,
		Confidence: parsed.Confidence,
		Thoughts:   parsed.Thoughts,
	}, nil
}

// ExecuteManualSignal executes a manually provided JSON signal

func (s *TradingService) ExecuteManualSignal(signalJson string, isTestnet bool) (*models.ExecuteManualSignalResponse, error) {

	// Parse the JSON signal
	var signal models.TradingSignal
	err := json.Unmarshal([]byte(signalJson), &signal)
	if err != nil {
		return &models.ExecuteManualSignalResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid JSON format: %v", err),
		}, fmt.Errorf("invalid JSON format: %w", err)
	}

	// Validate the signal
	if signal.Symbol == "" || signal.Direction == "" || signal.Entry <= 0 {
		return &models.ExecuteManualSignalResponse{
			Success: false,
			Message: "Invalid signal: missing required fields",
		}, fmt.Errorf("invalid signal: missing required fields")
	}

	// Set additional fields
	signal.ID = primitive.NewObjectID()
	signal.Status = "Active"
	signal.Leverage = 20
	if signal.Leverage == 0 {
		signal.Leverage = 20
	}
	signal.Timestamp = time.Now()
	signal.IsTestnet = isTestnet

	// Save the signal
	err = s.SaveTradingSignal(&signal)
	if err != nil {
		return &models.ExecuteManualSignalResponse{
			Success: false,
			Message: "Failed to save signal",
		}, fmt.Errorf("failed to save signal: %w", err)
	}

	// Execute the trade
	result, err := s.ExecuteTrade(&signal, isTestnet)
	if err != nil {
		return &models.ExecuteManualSignalResponse{
			Success: false,
			Message: fmt.Sprintf("Failed to execute trade: %v", err),
		}, fmt.Errorf("failed to execute trade: %w", err)
	}

	if !result.Success {
		return &models.ExecuteManualSignalResponse{
			Success: false,
			Signal:  signal.ToResponse(),
			Message: result.Message,
		}, fmt.Errorf("trade execution failed: %s", result.Message)
	}

	return &models.ExecuteManualSignalResponse{
		Success:       true,
		Signal:        signal.ToResponse(),
		TransactionId: result.TransactionId,
		Message:       "Manual signal executed successfully",
	}, nil
}

// Position management functions

// CreatePosition creates a new trading position

func (s *TradingService) CreatePosition(req *models.CreatePositionRequest) (*models.Position, error) {

	position := &models.Position{
		ID:           primitive.NewObjectID(),
		Symbol:       req.Symbol,
		Direction:    req.Direction,
		Size:         req.Size,
		EntryPrice:   req.EntryPrice,
		CurrentPrice: req.EntryPrice, // Initially same as entry price
		Leverage:     req.Leverage,
		Status:       "Open",
		IsTestnet:    req.IsTestnet,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
		StopLoss:     req.StopLoss,
		TakeProfit:   req.TakeProfit,
	}

	// Calculate initial PnL (should be 0)
	position.PnL = 0.0
	position.PnLPercentage = 0.0

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.positionCollection.InsertOne(ctx, position)
	if err != nil {
		return nil, fmt.Errorf("failed to create position: %w", err)
	}

	return position, nil
}

// GetPositions retrieves all trading positions

func (s *TradingService) GetPositions() ([]models.Position, error) {

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	opts := options.Find()
	opts.SetSort(bson.D{{Key: "createdAt", Value: -1}})

	cursor, err := s.positionCollection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve positions: %w", err)
	}
	defer cursor.Close(ctx)

	var positions []models.Position
	if err = cursor.All(ctx, &positions); err != nil {
		return nil, fmt.Errorf("failed to decode positions: %w", err)
	}

	// Update current prices and PnL for open positions
	for i := range positions {
		if positions[i].Status == "Open" {
			s.updatePositionPnL(&positions[i])
		}
	}

	return positions, nil
}

// ClosePosition closes a trading position

func (s *TradingService) ClosePosition(positionID string) (*models.Position, error) {

	objectID, err := primitive.ObjectIDFromHex(positionID)
	if err != nil {
		return nil, fmt.Errorf("invalid position ID format: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var position models.Position
	err = s.positionCollection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&position)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("position not found")
		}
		return nil, fmt.Errorf("failed to retrieve position: %w", err)
	}

	if position.Status != "Open" {
		return &position, fmt.Errorf("position is not open")
	}

	// --- REAL BINANCE CLOSE LOGIC ---
	futuresService := NewBinanceFuturesService(position.IsTestnet)
	if !futuresService.IsConfigured() {
		return nil, fmt.Errorf("binance API not configured")
	}

	// Fetch actual open position size from Binance
	binancePositions, err := futuresService.GetAccountInfo()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Binance account info: %w", err)
	}
	var actualSize float64 = position.Size
	for _, pos := range binancePositions.Positions {
		if pos.Symbol == position.Symbol && pos.PositionSide == "BOTH" {
			amt, err := strconv.ParseFloat(pos.PositionAmt, 64)
			if err == nil && amt != 0 {
				actualSize = math.Abs(amt)
				break
			}
		}
	}
	if actualSize == 0 {
		return nil, fmt.Errorf("no open position found on Binance to close")
	}

	// Place reduce-only market order in the opposite direction
	closeSide := "SELL"
	if position.Direction == "SHORT" {
		closeSide = "BUY"
	}
	orderReq := &OrderRequest{
		Symbol:       position.Symbol,
		Side:         closeSide,
		PositionSide: "BOTH",   // Always use BOTH since hedge mode is not used
		Type:         "MARKET", // Always use MARKET for closing
		Quantity:     actualSize,
		ReduceOnly:   true,
	}
	order, err := futuresService.PlaceOrder(orderReq)
	if err != nil {
		return nil, fmt.Errorf("failed to close position on Binance: %w", err)
	}

	// Get the close price from the order (if available)
	closePrice := position.CurrentPrice
	if order != nil {
		if p, err := strconv.ParseFloat(order.Price, 64); err == nil && p > 0 {
			closePrice = p
		}
	}
	closedAt := time.Now()

	update := bson.M{
		"$set": bson.M{
			"status":     "Closed",
			"updatedAt":  closedAt,
			"closedAt":   closedAt,
			"closePrice": closePrice,
		},
	}
	_, err = s.positionCollection.UpdateOne(ctx, bson.M{"_id": objectID}, update)
	if err != nil {
		return nil, fmt.Errorf("failed to update position: %w", err)
	}

	// Fetch the updated position
	err = s.positionCollection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&position)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated position: %w", err)
	}

	return &position, nil
}

// Alias CandlestickData to Kline for compatibility
// (If CandlestickData is referenced elsewhere, this ensures type compatibility)
type CandlestickData = Kline

// CreateTransaction inserts a new transaction record into the database
func (s *TradingService) CreateTransaction(req *models.CreateTransactionRequest) (*models.Transaction, error) {

	var positionID *primitive.ObjectID
	if req.PositionID != "" {
		id, err := primitive.ObjectIDFromHex(req.PositionID)
		if err == nil {
			positionID = &id
		}
	}
	var signalID *primitive.ObjectID
	if req.SignalID != "" {
		id, err := primitive.ObjectIDFromHex(req.SignalID)
		if err == nil {
			signalID = &id
		}
	}

	tx := &models.Transaction{
		ID:          primitive.NewObjectID(),
		Symbol:      req.Symbol,
		Type:        req.Type,
		Amount:      req.Amount,
		Price:       req.Price,
		Status:      req.Status,
		PnL:         req.PnL,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		PositionID:  positionID,
		SignalID:    signalID,
		IsTestnet:   req.IsTestnet,
		OrderID:     req.OrderID,
		Description: req.Description,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := s.transactionCollection.InsertOne(ctx, tx)
	if err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}
	return tx, nil
}

// updatePositionPnL updates the current price and PnL for a position
func (s *TradingService) updatePositionPnL(position *models.Position) {
	priceResp, err := s.binanceService.GetPrice(position.Symbol)
	if err != nil {
		return
	}
	position.CurrentPrice = priceResp.Price
	if position.Direction == "LONG" {
		position.PnL = (position.CurrentPrice - position.EntryPrice) * position.Size * float64(position.Leverage)
	} else {
		position.PnL = (position.EntryPrice - position.CurrentPrice) * position.Size * float64(position.Leverage)
	}
	if position.EntryPrice > 0 {
		position.PnLPercentage = (position.PnL / (position.EntryPrice * position.Size)) * 100
	}
}

// GetTransactions retrieves recent transactions from the database
func (s *TradingService) GetTransactions(limit int) ([]models.Transaction, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	opts := options.Find()
	opts.SetSort(bson.D{{Key: "createdAt", Value: -1}})
	opts.SetLimit(int64(limit))
	cursor, err := s.transactionCollection.Find(ctx, bson.M{}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var transactions []models.Transaction
	if err = cursor.All(ctx, &transactions); err != nil {
		return nil, err
	}
	return transactions, nil
}

// GetPerformanceMetrics calculates basic performance metrics from positions and transactions
func (s *TradingService) GetPerformanceMetrics() (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// Example: calculate total PnL and win rate from closed positions
	filter := bson.M{"status": "Closed"}
	cursor, err := s.positionCollection.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var positions []models.Position
	if err = cursor.All(ctx, &positions); err != nil {
		return nil, err
	}
	totalPnL := 0.0
	winCount := 0
	for _, pos := range positions {
		totalPnL += pos.PnL
		if pos.PnL > 0 {
			winCount++
		}
	}
	winRate := 0.0
	if len(positions) > 0 {
		winRate = float64(winCount) / float64(len(positions)) * 100
	}
	metrics := map[string]interface{}{
		"totalPnL":     totalPnL,
		"winRate":      winRate,
		"closedTrades": len(positions),
	}
	return metrics, nil
}

func TruncateToStepSize(quantity, stepSize float64) float64 {
	steps := math.Floor(quantity / stepSize)
	return steps * stepSize
}

// Exponential Moving Average (EMA)
func ema(values []float64, period int) []float64 {
	result := make([]float64, len(values))
	if len(values) < period {
		for i := range result {
			result[i] = math.NaN()
		}
		return result
	}
	k := 2.0 / float64(period+1)

	// Fill leading NaNs
	for i := 0; i < period-1; i++ {
		result[i] = math.NaN()
	}
	// SMA as the first EMA value
	var sum float64
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	result[period-1] = sum / float64(period)

	// Calculate EMA
	for i := period; i < len(values); i++ {
		result[i] = (values[i]-result[i-1])*k + result[i-1]
	}
	return result
}

// Relative Strength Index (RSI)
func CalculateRSI(candles []Kline, period int) {
	if len(candles) < period+1 {
		for i := range candles {
			candles[i].RSI = math.NaN()
		}
		return
	}

	// Fill initial NaNs
	for i := 0; i < period; i++ {
		candles[i].RSI = math.NaN()
	}

	var gain, loss float64
	for i := 1; i <= period; i++ {
		diff := candles[i].Close - candles[i-1].Close
		if diff > 0 {
			gain += diff
		} else {
			loss -= diff
		}
	}
	avgGain := gain / float64(period)
	avgLoss := loss / float64(period)

	if avgLoss == 0 {
		candles[period].RSI = 100
	} else {
		rs := avgGain / avgLoss
		candles[period].RSI = 100 - (100 / (1 + rs))
	}

	for i := period + 1; i < len(candles); i++ {
		diff := candles[i].Close - candles[i-1].Close
		g := 0.0
		l := 0.0
		if diff > 0 {
			g = diff
		} else {
			l = -diff
		}
		avgGain = ((avgGain * float64(period-1)) + g) / float64(period)
		avgLoss = ((avgLoss * float64(period-1)) + l) / float64(period)

		if avgLoss == 0 {
			candles[i].RSI = 100
		} else {
			rs := avgGain / avgLoss
			candles[i].RSI = 100 - (100 / (1 + rs))
		}
	}
}

// MACD (Moving Average Convergence Divergence)
func CalculateMACD(candles []Kline) {
	if len(candles) == 0 {
		return
	}
	prices := make([]float64, len(candles))
	for i, k := range candles {
		prices[i] = k.Close
	}
	ema12 := ema(prices, 12)
	ema26 := ema(prices, 26)

	macdLine := make([]float64, len(candles))
	for i := range macdLine {
		if math.IsNaN(ema12[i]) || math.IsNaN(ema26[i]) {
			macdLine[i] = math.NaN()
		} else {
			macdLine[i] = ema12[i] - ema26[i]
		}
	}
	macdForSignal := make([]float64, len(macdLine))
	copy(macdForSignal, macdLine)
	for i := range macdForSignal {
		if math.IsNaN(macdForSignal[i]) {
			macdForSignal[i] = 0
		}
	}
	signal := ema(macdForSignal, 9)

	for i := range candles {
		if math.IsNaN(macdLine[i]) || math.IsNaN(signal[i]) {
			candles[i].MACD = math.NaN()
			candles[i].MACDSignal = math.NaN()
			candles[i].MACDHist = math.NaN()
		} else {
			candles[i].MACD = macdLine[i]
			candles[i].MACDSignal = signal[i]
			candles[i].MACDHist = macdLine[i] - signal[i] // Histogram
		}
	}
}

// On-Balance Volume (OBV)
func CalculateOBV(candles []Kline) {
	if len(candles) == 0 {
		return
	}
	candles[0].OBV = 0
	for i := 1; i < len(candles); i++ {
		switch {
		case candles[i].Close > candles[i-1].Close:
			candles[i].OBV = candles[i-1].OBV + candles[i].Volume
		case candles[i].Close < candles[i-1].Close:
			candles[i].OBV = candles[i-1].OBV - candles[i].Volume
		default:
			candles[i].OBV = candles[i-1].OBV
		}
	}
}

// BuildChartDataPrompt returns only the chart data in the prompt style (Market Data... and candles)
func (s *TradingService) BuildChartDataPrompt(symbol string, selectedTimeframes []string) (string, error) {
	currentPrice, err := s.binanceService.GetPrice(symbol)
	if err != nil {
		return "", fmt.Errorf("failed to get current price: %w", err)
	}

	marketData := make(map[string][]Kline)
	for _, tf := range selectedTimeframes {
		klines, err := s.binanceService.GetKlines(symbol, tf, 70)
		if err != nil {
			return "", fmt.Errorf("failed to fetch market data for %s: %w", tf, err)
		}
		CalculateRSI(klines, 14)
		CalculateMACD(klines)
		CalculateOBV(klines)
		marketData[tf] = klines
	}
	prompt := "Candles and Indicators for " + symbol + "\n\n"
	prompt += "current_price: " + strconv.FormatFloat(currentPrice.Price, 'f', 6, 64) + "\n\n"
	for tf, tfCandles := range marketData {
		n := 35
		if len(tfCandles) > n {
			tfCandles = tfCandles[len(tfCandles)-n:]
		}
		prompt += fmt.Sprintf("Market Data (%s, last %d candles):\n", tf, len(tfCandles))
		for i, candle := range tfCandles {
			prompt += fmt.Sprintf("Candle %d: OpenTime: %d, Open: %.7f, High: %.7f, Low: %.7f, Close: %.7f, Volume: %.2f, Trades: %d, RSI: %.2f, MACD: %.5f, OBV: %.0f\n",
				i+1, candle.OpenTime, candle.Open, candle.High, candle.Low, candle.Close, candle.Volume, candle.NumberOfTrades, candle.RSI, candle.MACD, candle.OBV)
		}
		prompt += "\n"
	}
	return prompt, nil
}
