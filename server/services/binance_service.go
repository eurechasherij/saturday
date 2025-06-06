package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

type BinanceService struct {
	baseURL string
	client  *http.Client
}

type BinancePriceData struct {
	Symbol             string  `json:"symbol"`
	PriceStr           string  `json:"lastPrice"` // Changed from "price" to "lastPrice"
	Price              float64 // We'll parse this manually
	PriceChange        float64 `json:"priceChange,string"`
	PriceChangePercent float64 `json:"priceChangePercent,string"`
	Volume             float64 `json:"volume,string"`
	QuoteVolume        float64 `json:"quoteVolume,string"`
}

type BinancePriceResponse struct {
	Price     float64 `json:"price"`
	Change24h float64 `json:"change24h"`
	Volume    float64 `json:"volume"`
}

// Kline represents candlestick data
type Kline struct {
	OpenTime                 int64   `json:"openTime"`
	Open                     float64 `json:"open"`
	High                     float64 `json:"high"`
	Low                      float64 `json:"low"`
	Close                    float64 `json:"close"`
	Volume                   float64 `json:"volume"`
	CloseTime                int64   `json:"closeTime"`
	QuoteAssetVolume         float64 `json:"quoteAssetVolume"`
	NumberOfTrades           int     `json:"numberOfTrades"`
	TakerBuyBaseAssetVolume  float64 `json:"takerBuyBaseAssetVolume"`
	TakerBuyQuoteAssetVolume float64 `json:"takerBuyQuoteAssetVolume"`
	RSI                      float64 `json:"rsi"`
	MACD                     float64 `json:"macd"`
	MACDSignal               float64 `json:"macdSignal"`
	MACDHist                 float64 `json:"macdHist"`
	OBV                      float64 `json:"obv"`
}

// TimeframeData contains analysis data for a specific timeframe
type TimeframeData struct {
	Timeframe string  `json:"timeframe"`
	Klines    []Kline `json:"klines"`
	Summary   string  `json:"summary"`
}

// MultiTimeframeData contains data from all requested timeframes
type MultiTimeframeData struct {
	Symbol       string                   `json:"symbol"`
	CurrentPrice float64                  `json:"currentPrice"`
	Timeframes   map[string]TimeframeData `json:"timeframes"`
}

func NewBinanceService() *BinanceService {
	baseURL := os.Getenv("BINANCE_MAINNET_URL") + "/fapi/v1"

	if baseURL == "" {
		baseURL = "https://fapi.binance.com/fapi/v1"
	}

	return &BinanceService{
		baseURL: baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (s *BinanceService) GetPrice(symbol string) (*BinancePriceResponse, error) {
	url := fmt.Sprintf("%s/ticker/24hr?symbol=%s", s.baseURL, symbol)

	resp, err := s.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch price from Binance: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance API error: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var priceData BinancePriceData
	if err := json.Unmarshal(body, &priceData); err != nil {
		return nil, fmt.Errorf("failed to parse price data: %w", err)
	}

	// Parse the price string to float64
	price, err := strconv.ParseFloat(priceData.PriceStr, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse price: %w", err)
	}
	priceData.Price = price

	response := &BinancePriceResponse{
		Price:     priceData.Price,
		Change24h: priceData.PriceChangePercent,
		Volume:    priceData.Volume,
	}

	return response, nil
}

// GetKlines fetches candlestick data for a specific timeframe
func (s *BinanceService) GetKlines(symbol, interval string, limit int) ([]Kline, error) {
	url := fmt.Sprintf("%s/klines?symbol=%s&interval=%s&limit=%d", s.baseURL, symbol, interval, limit)

	resp, err := s.client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch klines from Binance: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance klines API error: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read klines response: %w", err)
	}

	// Parse the raw klines data
	var rawKlines [][]interface{}
	if err := json.Unmarshal(body, &rawKlines); err != nil {
		return nil, fmt.Errorf("failed to parse klines data: %w", err)
	}

	// Convert to structured format
	klines := make([]Kline, len(rawKlines))
	for i, raw := range rawKlines {
		if len(raw) < 12 {
			continue
		}

		kline := Kline{}
		if openTime, ok := raw[0].(float64); ok {
			kline.OpenTime = int64(openTime)
		}
		if open, ok := raw[1].(string); ok {
			if f, err := strconv.ParseFloat(open, 64); err == nil {
				kline.Open = f
			}
		}
		if high, ok := raw[2].(string); ok {
			if f, err := strconv.ParseFloat(high, 64); err == nil {
				kline.High = f
			}
		}
		if low, ok := raw[3].(string); ok {
			if f, err := strconv.ParseFloat(low, 64); err == nil {
				kline.Low = f
			}
		}
		if close, ok := raw[4].(string); ok {
			if f, err := strconv.ParseFloat(close, 64); err == nil {
				kline.Close = f
			}
		}
		if volume, ok := raw[5].(string); ok {
			if f, err := strconv.ParseFloat(volume, 64); err == nil {
				kline.Volume = f
			}
		}
		if closeTime, ok := raw[6].(float64); ok {
			kline.CloseTime = int64(closeTime)
		}
		if quoteVolume, ok := raw[7].(string); ok {
			if f, err := strconv.ParseFloat(quoteVolume, 64); err == nil {
				kline.QuoteAssetVolume = f
			}
		}
		if trades, ok := raw[8].(float64); ok {
			kline.NumberOfTrades = int(trades)
		}

		klines[i] = kline
	}

	return klines, nil
}

// GetMultiTimeframeData fetches candlestick data for multiple timeframes
func (s *BinanceService) GetMultiTimeframeData(symbol string) (*MultiTimeframeData, error) {
	// Get current price first
	priceData, err := s.GetPrice(symbol)
	if err != nil {
		return nil, err
	}

	timeframes := []string{"5m", "15m", "30m", "1h"}
	timeframeData := make(map[string]TimeframeData)

	for _, tf := range timeframes {
		klines, err := s.GetKlines(symbol, tf, 100) // Get last 100 candles
		if err != nil {
			continue
		}

		// Generate summary for this timeframe
		summary := s.generateTimeframeSummary(klines, tf)

		timeframeData[tf] = TimeframeData{
			Timeframe: tf,
			Klines:    klines,
			Summary:   summary,
		}
	}

	result := &MultiTimeframeData{
		Symbol:       symbol,
		CurrentPrice: priceData.Price,
		Timeframes:   timeframeData,
	}

	return result, nil
}

// generateTimeframeSummary creates a summary of the timeframe data
func (s *BinanceService) generateTimeframeSummary(klines []Kline, timeframe string) string {
	if len(klines) == 0 {
		return fmt.Sprintf("No data available for %s timeframe", timeframe)
	}

	latest := klines[len(klines)-1]
	previous := klines[len(klines)-2]

	trend := "neutral"
	if latest.Close > previous.Close {
		trend = "bullish"
	} else if latest.Close < previous.Close {
		trend = "bearish"
	}

	// Calculate average volume
	totalVolume := 0.0
	for _, k := range klines {
		totalVolume += k.Volume
	}
	avgVolume := totalVolume / float64(len(klines))

	volumeStatus := "normal"
	if latest.Volume > avgVolume*1.5 {
		volumeStatus = "high"
	} else if latest.Volume < avgVolume*0.5 {
		volumeStatus = "low"
	}

	return fmt.Sprintf("%s timeframe shows %s trend with %s volume. Latest close: %.6f", timeframe, trend, volumeStatus, latest.Close)
}
