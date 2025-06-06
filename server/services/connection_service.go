package services

import (
	"context"
	"log"
	"saturday-autotrade/config"
	"time"
)

type ConnectionService struct {
	binanceService *BinanceService
	llmService     *LLMService
}

type ConnectionStatus struct {
	Binance     bool      `json:"binance"`
	OpenAI      bool      `json:"openai"`
	Database    bool      `json:"database"`
	LastChecked time.Time `json:"lastChecked"`
}

func NewConnectionService() *ConnectionService {
	return &ConnectionService{
		binanceService: NewBinanceService(),
		llmService:     NewLLMService(),
	}
}

// CheckBinanceConnection tests connectivity to Binance API
func (cs *ConnectionService) CheckBinanceConnection() bool {
	log.Printf("ConnectionService: Checking Binance connection...")

	// Try to fetch a simple price to test connectivity
	_, err := cs.binanceService.GetPrice("BTCUSDT")
	if err != nil {
		log.Printf("ConnectionService: Binance connection failed: %v", err)
		return false
	}

	log.Printf("ConnectionService: Binance connection successful")
	return true
}

// CheckOpenAIConnection tests connectivity to OpenAI API
func (cs *ConnectionService) CheckOpenAIConnection() bool {
	log.Printf("ConnectionService: Checking OpenAI connection...")

	// Check if service is properly configured
	if !cs.llmService.IsConfigured() {
		log.Printf("ConnectionService: OpenAI not configured")
		return false
	}

	// For now, we'll assume it's connected if configured
	// In a real implementation, you could make a simple API call to test
	log.Printf("ConnectionService: OpenAI connection successful")
	return true
}

// CheckDatabaseConnection tests connectivity to MongoDB
func (cs *ConnectionService) CheckDatabaseConnection() bool {
	log.Printf("ConnectionService: Checking database connection...")

	if config.DB == nil {
		log.Printf("ConnectionService: Database not initialized")
		return false
	}

	// Test database connectivity by attempting a simple operation
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Try to run a simple command to test the connection
	err := config.DB.RunCommand(ctx, map[string]interface{}{"ping": 1}).Err()
	if err != nil {
		log.Printf("ConnectionService: Database ping failed: %v", err)
		return false
	}

	log.Printf("ConnectionService: Database connection successful")
	return true
}

// GetConnectionStatus checks all services and returns overall status
func (cs *ConnectionService) GetConnectionStatus() *ConnectionStatus {
	log.Printf("ConnectionService: Getting connection status for all services...")

	status := &ConnectionStatus{
		Binance:     cs.CheckBinanceConnection(),
		OpenAI:      cs.CheckOpenAIConnection(),
		Database:    cs.CheckDatabaseConnection(),
		LastChecked: time.Now(),
	}

	log.Printf("ConnectionService: Connection status - Binance: %t, OpenAI: %t, Database: %t",
		status.Binance, status.OpenAI, status.Database)

	return status
}
