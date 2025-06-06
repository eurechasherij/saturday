package services

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"
)

type BinanceFuturesService struct {
	apiKey    string
	secretKey string
	baseURL   string
	client    *http.Client
}

// Order represents a Binance futures order
type BinanceOrder struct {
	Symbol        string `json:"symbol"`
	OrderID       int64  `json:"orderId"`
	ClientOrderID string `json:"clientOrderId"`
	Price         string `json:"price"`
	OrigQty       string `json:"origQty"`
	ExecutedQty   string `json:"executedQty"`
	CumQuote      string `json:"cumQuote"`
	Status        string `json:"status"`
	TimeInForce   string `json:"timeInForce"`
	Type          string `json:"type"`
	Side          string `json:"side"`
	StopPrice     string `json:"stopPrice"`
	IcebergQty    string `json:"icebergQty"`
	Time          int64  `json:"time"`
	UpdateTime    int64  `json:"updateTime"`
	IsWorking     bool   `json:"isWorking"`
	OrigType      string `json:"origType"`
	PositionSide  string `json:"positionSide"`
	ActivatePrice string `json:"activatePrice"`
	PriceRate     string `json:"priceRate"`
	WorkingType   string `json:"workingType"`
	PriceProtect  bool   `json:"priceProtect"`
}

// OrderRequest represents a new order request
type OrderRequest struct {
	Symbol           string  `json:"symbol"`
	Side             string  `json:"side"`         // BUY or SELL
	PositionSide     string  `json:"positionSide"` // BOTH, LONG, SHORT
	Type             string  `json:"type"`         // MARKET, LIMIT, STOP, etc.
	Quantity         float64 `json:"quantity"`
	Price            float64 `json:"price,omitempty"`
	StopPrice        float64 `json:"stopPrice,omitempty"`
	TimeInForce      string  `json:"timeInForce,omitempty"`
	ReduceOnly       bool    `json:"reduceOnly,omitempty"`
	NewClientOrderID string  `json:"newClientOrderId,omitempty"`
	WorkingType      string  `json:"workingType,omitempty"`
	NewOrderRespType string  `json:"newOrderRespType,omitempty"`
}

// AccountInfo represents account information
type AccountInfo struct {
	Assets    []AssetInfo    `json:"assets"`
	Positions []PositionInfo `json:"positions"`
}

type AssetInfo struct {
	Asset                  string `json:"asset"`
	WalletBalance          string `json:"walletBalance"`
	UnrealizedProfit       string `json:"unrealizedProfit"`
	MarginBalance          string `json:"marginBalance"`
	MaintMargin            string `json:"maintMargin"`
	InitialMargin          string `json:"initialMargin"`
	PositionInitialMargin  string `json:"positionInitialMargin"`
	OpenOrderInitialMargin string `json:"openOrderInitialMargin"`
	MaxWithdrawAmount      string `json:"maxWithdrawAmount"`
	CrossWalletBalance     string `json:"crossWalletBalance"`
	CrossUnPnl             string `json:"crossUnPnl"`
	AvailableBalance       string `json:"availableBalance"`
}

type PositionInfo struct {
	Symbol                 string `json:"symbol"`
	InitialMargin          string `json:"initialMargin"`
	MaintMargin            string `json:"maintMargin"`
	UnrealizedProfit       string `json:"unrealizedProfit"`
	PositionInitialMargin  string `json:"positionInitialMargin"`
	OpenOrderInitialMargin string `json:"openOrderInitialMargin"`
	Leverage               string `json:"leverage"`
	Isolated               bool   `json:"isolated"`
	EntryPrice             string `json:"entryPrice"`
	MaxNotional            string `json:"maxNotional"`
	BidNotional            string `json:"bidNotional"`
	AskNotional            string `json:"askNotional"`
	PositionSide           string `json:"positionSide"`
	PositionAmt            string `json:"positionAmt"`
	UpdateTime             int64  `json:"updateTime"`
}

// LeverageResponse represents leverage change response
type LeverageResponse struct {
	Leverage         int    `json:"leverage"`
	MaxNotionalValue string `json:"maxNotionalValue"`
	Symbol           string `json:"symbol"`
}

func NewBinanceFuturesService(isTestnet bool) *BinanceFuturesService {
	apiKey := os.Getenv("BINANCE_API_KEY")
	secretKey := os.Getenv("BINANCE_SECRET_KEY")

	baseURL := os.Getenv("BINANCE_MAINNET_URL")
	if isTestnet {
		baseURL = os.Getenv("BINANCE_TESTNET_URL")
		apiKey = os.Getenv("BINANCE_TESTNET_API_KEY")
		secretKey = os.Getenv("BINANCE_TESTNET_SECRET_KEY")
	}

	if baseURL == "" {
		if isTestnet {
			baseURL = "https://testnet.binancefuture.com"
		} else {
			baseURL = "https://fapi.binance.com"
		}
	}

	return &BinanceFuturesService{
		apiKey:    apiKey,
		secretKey: secretKey,
		baseURL:   baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// IsConfigured checks if Binance API credentials are properly configured
func (s *BinanceFuturesService) IsConfigured() bool {
	return s.apiKey != "" && s.secretKey != ""
}

// generateSignature generates HMAC SHA256 signature for Binance API
func (s *BinanceFuturesService) generateSignature(queryString string) string {
	mac := hmac.New(sha256.New, []byte(s.secretKey))
	mac.Write([]byte(queryString))
	return hex.EncodeToString(mac.Sum(nil))
}

// makeSignedRequest makes a signed request to Binance API
func (s *BinanceFuturesService) makeSignedRequest(method, endpoint string, params map[string]string) ([]byte, error) {
	if !s.IsConfigured() {
		return nil, fmt.Errorf("binance API credentials not configured")
	}

	// Add timestamp
	params["timestamp"] = strconv.FormatInt(time.Now().UnixMilli(), 10)

	// Build query string
	values := url.Values{}
	for key, value := range params {
		values.Add(key, value)
	}
	queryString := values.Encode()

	// Generate signature
	signature := s.generateSignature(queryString)
	queryString += "&signature=" + signature

	// Build URL
	requestURL := fmt.Sprintf("%s%s?%s", s.baseURL, endpoint, queryString)

	// Create request
	req, err := http.NewRequest(method, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers
	req.Header.Set("X-MBX-APIKEY", s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	// Make request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance API error: %s", string(body))
	}

	return body, nil
}

// SetLeverage sets the leverage for a symbol
func (s *BinanceFuturesService) SetLeverage(symbol string, leverage int) (*LeverageResponse, error) {
	if !s.IsConfigured() {
		// Mock response for testing
		return &LeverageResponse{
			Leverage:         leverage,
			MaxNotionalValue: "1000000",
			Symbol:           symbol,
		}, nil
	}

	params := map[string]string{
		"symbol":   symbol,
		"leverage": strconv.Itoa(leverage),
	}

	body, err := s.makeSignedRequest("POST", "/fapi/v1/leverage", params)
	if err != nil {
		return nil, fmt.Errorf("failed to set leverage: %w", err)
	}

	var response LeverageResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse leverage response: %w", err)
	}

	return &response, nil
}

// PlaceOrder places a new order on Binance Futures
func (s *BinanceFuturesService) PlaceOrder(orderReq *OrderRequest) (*BinanceOrder, error) {
	if !s.IsConfigured() {
		// Mock response for testing
		mockOrder := &BinanceOrder{
			Symbol:        orderReq.Symbol,
			OrderID:       time.Now().UnixNano(),
			ClientOrderID: fmt.Sprintf("mock_%d", time.Now().UnixNano()),
			Price:         fmt.Sprintf("%.6f", orderReq.Price),
			OrigQty:       fmt.Sprintf("%.6f", orderReq.Quantity),
			ExecutedQty:   fmt.Sprintf("%.6f", orderReq.Quantity),
			Status:        "FILLED",
			Type:          orderReq.Type,
			Side:          orderReq.Side,
			Time:          time.Now().UnixMilli(),
			UpdateTime:    time.Now().UnixMilli(),
		}
		return mockOrder, nil
	}

	params := map[string]string{
		"symbol":       orderReq.Symbol,
		"side":         orderReq.Side,
		"type":         orderReq.Type,
		"quantity":     fmt.Sprintf("%.6f", orderReq.Quantity),
		"positionSide": orderReq.PositionSide,
	}

	if orderReq.Price > 0 {
		params["price"] = fmt.Sprintf("%.6f", orderReq.Price)
	}

	if orderReq.StopPrice > 0 {
		params["stopPrice"] = fmt.Sprintf("%.6f", orderReq.StopPrice)
	}

	if orderReq.TimeInForce != "" {
		params["timeInForce"] = orderReq.TimeInForce
	}

	if orderReq.NewClientOrderID != "" {
		params["newClientOrderId"] = orderReq.NewClientOrderID
	}

	if orderReq.ReduceOnly {
		// Only send reduceOnly if not a MARKET order, or if MARKET but positionSide is not BOTH
		if orderReq.Type != "MARKET" || (orderReq.Type == "MARKET" && orderReq.PositionSide != "BOTH") {
			params["reduceOnly"] = "true"
		}
	}

	body, err := s.makeSignedRequest("POST", "/fapi/v1/order", params)
	if err != nil {
		return nil, fmt.Errorf("failed to place order: %w", err)
	}

	var order BinanceOrder
	if err := json.Unmarshal(body, &order); err != nil {
		return nil, fmt.Errorf("failed to parse order response: %w", err)
	}

	return &order, nil
}

// GetAccountInfo retrieves account information
func (s *BinanceFuturesService) GetAccountInfo() (*AccountInfo, error) {
	if !s.IsConfigured() {
		// Mock response for testing
		return &AccountInfo{
			Assets: []AssetInfo{
				{
					Asset:            "USDT",
					WalletBalance:    "10000.00000000",
					UnrealizedProfit: "0.00000000",
					MarginBalance:    "10000.00000000",
					AvailableBalance: "10000.00000000",
				},
			},
			Positions: []PositionInfo{},
		}, nil
	}

	params := map[string]string{}

	body, err := s.makeSignedRequest("GET", "/fapi/v2/account", params)
	if err != nil {
		return nil, fmt.Errorf("failed to get account info: %w", err)
	}

	var accountInfo AccountInfo
	if err := json.Unmarshal(body, &accountInfo); err != nil {
		return nil, fmt.Errorf("failed to parse account info: %w", err)
	}

	return &accountInfo, nil
}

// CancelOrder cancels an existing order
func (s *BinanceFuturesService) CancelOrder(symbol string, orderID int64) (*BinanceOrder, error) {
	if !s.IsConfigured() {
		// Mock response for testing
		return &BinanceOrder{
			Symbol:     symbol,
			OrderID:    orderID,
			Status:     "CANCELED",
			UpdateTime: time.Now().UnixMilli(),
		}, nil
	}

	params := map[string]string{
		"symbol":  symbol,
		"orderId": strconv.FormatInt(orderID, 10),
	}

	body, err := s.makeSignedRequest("DELETE", "/fapi/v1/order", params)
	if err != nil {
		return nil, fmt.Errorf("failed to cancel order: %w", err)
	}

	var order BinanceOrder
	if err := json.Unmarshal(body, &order); err != nil {
		return nil, fmt.Errorf("failed to parse cancel order response: %w", err)
	}

	return &order, nil
}

// GetOrder retrieves order information
func (s *BinanceFuturesService) GetOrder(symbol string, orderID int64) (*BinanceOrder, error) {
	if !s.IsConfigured() {
		// Mock response for testing
		return &BinanceOrder{
			Symbol:      symbol,
			OrderID:     orderID,
			Status:      "FILLED",
			ExecutedQty: "1.000000",
			UpdateTime:  time.Now().UnixMilli(),
		}, nil
	}

	params := map[string]string{
		"symbol":  symbol,
		"orderId": strconv.FormatInt(orderID, 10),
	}

	body, err := s.makeSignedRequest("GET", "/fapi/v1/order", params)
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	var order BinanceOrder
	if err := json.Unmarshal(body, &order); err != nil {
		return nil, fmt.Errorf("failed to parse order response: %w", err)
	}

	return &order, nil
}

// ValidateMarginAndBalance checks if user has sufficient margin for the trade
func (s *BinanceFuturesService) ValidateMarginAndBalance(symbol string, quantity float64, price float64, leverage int) error {
	accountInfo, err := s.GetAccountInfo()
	if err != nil {
		return fmt.Errorf("failed to get account info for margin validation: %w", err)
	}

	// Find USDT balance
	var usdtBalance float64
	for _, asset := range accountInfo.Assets {
		if asset.Asset == "USDT" {
			balance, err := strconv.ParseFloat(asset.AvailableBalance, 64)
			if err != nil {
				continue
			}
			usdtBalance = balance
			break
		}
	}

	// Calculate required margin
	notionalValue := quantity * price
	requiredMargin := notionalValue / float64(leverage)

	if usdtBalance < requiredMargin {
		return fmt.Errorf("insufficient margin: required %.2f USDT, available %.2f USDT", requiredMargin, usdtBalance)
	}

	return nil
}

func (s *BinanceFuturesService) GetSymbolStepSizeAndMinQty(symbol string) (float64, float64, error) {
	url := s.baseURL + "/fapi/v1/exchangeInfo"
	resp, err := s.client.Get(url)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get exchange info: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to read exchange info: %w", err)
	}
	var info struct {
		Symbols []struct {
			Symbol  string `json:"symbol"`
			Filters []struct {
				FilterType string `json:"filterType"`
				MinQty     string `json:"minQty,omitempty"`
				StepSize   string `json:"stepSize,omitempty"`
			} `json:"filters"`
		} `json:"symbols"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return 0, 0, fmt.Errorf("failed to parse exchange info: %w", err)
	}
	for _, s := range info.Symbols {
		if s.Symbol == symbol {
			for _, f := range s.Filters {
				if f.FilterType == "LOT_SIZE" {
					stepSize, _ := strconv.ParseFloat(f.StepSize, 64)
					minQty, _ := strconv.ParseFloat(f.MinQty, 64)
					return stepSize, minQty, nil
				}
			}
		}
	}
	return 0, 0, fmt.Errorf("symbol %s not found", symbol)
}
