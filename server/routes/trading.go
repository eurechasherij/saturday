package routes

import (
	"net/http"
	"saturday-autotrade/models"
	"saturday-autotrade/services"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func SetupTradingRoutes(router *gin.Engine) {
	api := router.Group("/api/trading")

	tradingService := services.NewTradingService()
	connectionService := services.NewConnectionService()

	// Generate trading signal endpoint (already exists in main.go, will be moved here)
	api.POST("/generate-signal", func(c *gin.Context) {
		var req models.GenerateSignalRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if req.Model == "" {
			req.Model = "gpt-3.5-turbo"
		} else {
			validModels := map[string]bool{
				"gpt-3.5-turbo": true,
				"gpt-4":         true,
				"gpt-4-turbo":   true,
				"gpt-4o":        true,
				"gpt-4o-mini":   true,
				"gpt-4.1":       true}
			if !validModels[req.Model] {
				req.Model = "gpt-3.5-turbo"
			}
		}

		// Default to 1h if not provided
		selectedTimeframes := req.Timeframes
		if len(selectedTimeframes) == 0 {
			selectedTimeframes = []string{"1h"}
		}

		signal, err := tradingService.GenerateTradingSignalFromAI(req.Symbol, req.Model, selectedTimeframes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Save the signal to database
		if err := tradingService.SaveTradingSignal(signal); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save trading signal"})
			return
		}

		response := models.GenerateSignalResponse{
			Signal: signal.ToResponse(),
		}

		c.JSON(http.StatusOK, response)
	})

	// Execute trading signal endpoint
	api.POST("/execute", func(c *gin.Context) {
		var req models.ExecuteTradeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get the signal from database to ensure it exists and get full data
		signal, err := tradingService.GetTradingSignalByID(req.Signal.ID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Trading signal not found"})
			return
		}

		// Execute the trade
		result, err := tradingService.ExecuteTrade(signal, req.IsTestnet)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if !result.Success {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   result.Message,
				"success": false,
			})
			return
		}

		c.JSON(http.StatusOK, result)
	})

	// Execute manual JSON signal endpoint
	api.POST("/execute-manual", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		var req models.ExecuteManualSignalRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate that signal JSON is not empty
		if strings.TrimSpace(req.SignalJson) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Signal JSON is required"})
			return
		}

		// Execute the manual signal
		result, err := tradingService.ExecuteManualSignal(req.SignalJson, req.IsTestnet)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		if !result.Success {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   result.Message,
				"success": false,
			})
			return
		}

		c.JSON(http.StatusOK, result)
	})

	// Fetch trading signals endpoint
	api.GET("/signals", func(c *gin.Context) {
		limitStr := c.DefaultQuery("limit", "50")
		limit, err := strconv.Atoi(limitStr)
		if err != nil {
			limit = 50
		}

		signals, err := tradingService.GetTradingSignals(limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Convert to response format
		var signalResponses []models.TradingSignalResponse
		for _, signal := range signals {
			signalResponses = append(signalResponses, signal.ToResponse())
		}

		c.JSON(http.StatusOK, gin.H{"signals": signalResponses})
	})

	// Get single trading signal by ID
	api.GET("/signals/:id", func(c *gin.Context) {
		id := c.Param("id")

		signal, err := tradingService.GetTradingSignalByID(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"signal": signal.ToResponse()})
	})

	// Get Binance price endpoint
	api.GET("/binance-price/:symbol", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		symbol := c.Param("symbol")

		price, err := tradingService.GetBinancePrice(symbol)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, price)
	})

	// Create new trading position
	api.POST("/positions", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		var req models.CreatePositionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate required fields
		if req.Symbol == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Symbol is required"})
			return
		}

		if req.Direction != "LONG" && req.Direction != "SHORT" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Direction must be LONG or SHORT"})
			return
		}

		if req.Size <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Size must be greater than 0"})
			return
		}

		if req.EntryPrice <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Entry price must be greater than 0"})
			return
		}

		if req.Leverage < 1 || req.Leverage > 125 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Leverage must be between 1 and 125"})
			return
		}

		// Create the position
		position, err := tradingService.CreatePosition(&req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		response := models.CreatePositionResponse{
			Success:  true,
			Position: position.ToResponse(),
			Message:  "Successfully created position",
		}

		c.JSON(http.StatusCreated, response)
	})

	// Get all trading positions
	api.GET("/positions", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		positions, err := tradingService.GetPositions()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Convert to response format and ensure we always have a slice, never nil
		positionResponses := make([]models.PositionResponse, 0, len(positions))
		for _, position := range positions {
			positionResponses = append(positionResponses, position.ToResponse())
		}

		response := gin.H{"positions": positionResponses}

		c.JSON(http.StatusOK, response)
	})

	// Close trading position
	api.POST("/positions/:id/close", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		id := c.Param("id")

		var req models.ClosePositionRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate close price
		if req.ClosePrice <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Close price must be greater than 0"})
			return
		}

		// Close the position (service currently only supports id)
		position, err := tradingService.ClosePosition(id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		response := models.ClosePositionResponse{
			Success:  true,
			Position: position.ToResponse(),
			Message:  "Successfully closed position",
		}

		c.JSON(http.StatusOK, response)
	})

	// Get transaction history
	api.GET("/transactions", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		limitStr := c.DefaultQuery("limit", "50")
		limit, err := strconv.Atoi(limitStr)
		if err != nil {
			limit = 50
		}

		transactions, err := tradingService.GetTransactions(limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Convert to response format and ensure we always have a slice, never nil
		transactionResponses := make([]models.TransactionResponse, 0, len(transactions))
		for _, transaction := range transactions {
			transactionResponses = append(transactionResponses, transaction.ToResponse())
		}

		c.JSON(http.StatusOK, gin.H{"transactions": transactionResponses})
	})

	// Get performance metrics
	api.GET("/performance", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		metrics, err := tradingService.GetPerformanceMetrics()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"metrics": metrics})
	})

	// Get connection status endpoint
	api.GET("/status", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		status := connectionService.GetConnectionStatus()

		c.JSON(http.StatusOK, gin.H{"status": status})
	})

	// Get real-time price data endpoint (new format)
	api.GET("/prices/:symbol", func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
			}
		}()

		symbol := c.Param("symbol")

		// Validate symbol format - should be uppercase and likely end with USDT
		if len(symbol) < 3 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid symbol format"})
			return
		}

		// Convert symbol to standard format (e.g., BTC -> BTCUSDT)
		standardSymbol := symbol
		if symbol == "BTC" {
			standardSymbol = "BTCUSDT"
		} else if symbol == "ETH" {
			standardSymbol = "ETHUSDT"
		} else if symbol == "XRP" {
			standardSymbol = "XRPUSDT"
		} else if symbol == "DOGE" {
			standardSymbol = "DOGEUSDT"
		} else if !strings.HasSuffix(strings.ToUpper(symbol), "USDT") {
			standardSymbol = strings.ToUpper(symbol) + "USDT"
		}

		binanceService := services.NewBinanceService()
		priceData, err := binanceService.GetPrice(standardSymbol)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch price data for symbol"})
			return
		}

		// Create the response with all required fields
		response := gin.H{
			"symbol":           symbol,
			"currentPrice":     priceData.Price,
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
			"volume24h":        priceData.Volume,
			"percentChange24h": priceData.Change24h,
		}

		c.JSON(http.StatusOK, response)
	})

	// Get real USDT balance endpoint
	api.GET("/balance", func(c *gin.Context) {
		futuresService := services.NewBinanceFuturesService(false) // false = mainnet
		accountInfo, err := futuresService.GetAccountInfo()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		usdtBalance := 0.0
		for _, asset := range accountInfo.Assets {
			if asset.Asset == "USDT" {
				usdtBalance, _ = strconv.ParseFloat(asset.WalletBalance, 64)
				break
			}
		}
		c.JSON(http.StatusOK, gin.H{"usdtBalance": usdtBalance})
	})

	// Chart data prompt endpoint
	api.POST("/chart-data-prompt", func(c *gin.Context) {
		var req struct {
			Symbol     string   `json:"symbol"`
			Timeframes []string `json:"timeframes"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}
		prompt, err := tradingService.BuildChartDataPrompt(req.Symbol, req.Timeframes)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"prompt": prompt})
	})
}
