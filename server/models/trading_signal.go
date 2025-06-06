package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type TradingSignal struct {
	ID         primitive.ObjectID `json:"_id,omitempty" bson:"_id,omitempty"`
	Symbol     string             `json:"symbol" bson:"symbol" binding:"required"`
	Direction  string             `json:"direction" bson:"direction" binding:"required,oneof=LONG SHORT"`
	Entry      float64            `json:"entry" bson:"entry" binding:"required,gt=0"`
	SL         float64            `json:"sl" bson:"sl" binding:"required,gt=0"`
	TP         float64            `json:"tp" bson:"tp" binding:"required,gt=0"`
	RR         float64            `json:"rr" bson:"rr" binding:"required,gt=0"`
	Confidence int                `json:"confidence" bson:"confidence" binding:"required,min=0,max=100"`
	Thoughts   string             `json:"thoughts" bson:"thoughts" binding:"required"`
	Leverage   int                `json:"leverage" bson:"leverage"`
	Status     string             `json:"status" bson:"status"`
	Model      string             `json:"model" bson:"model"`
	Timestamp  time.Time          `json:"timestamp" bson:"timestamp"`
	CreatedAt  time.Time          `json:"createdAt" bson:"createdAt"`
	UpdatedAt  time.Time          `json:"updatedAt" bson:"updatedAt"`

	// Execution fields
	ExecutedAt         *time.Time `json:"executedAt,omitempty" bson:"executedAt,omitempty"`
	TransactionId      string     `json:"transactionId,omitempty" bson:"transactionId,omitempty"`
	ExecutionPrice     float64    `json:"executionPrice,omitempty" bson:"executionPrice,omitempty"`
	IsTestnet          bool       `json:"isTestnet" bson:"isTestnet"`
	TimeframesAnalyzed []string   `json:"timeframesAnalyzed,omitempty" bson:"timeframesAnalyzed,omitempty"`
}

type TradingSignalResponse struct {
	ID             string  `json:"_id"`
	Symbol         string  `json:"symbol"`
	Direction      string  `json:"direction"`
	Entry          float64 `json:"entry"`
	SL             float64 `json:"sl"`
	TP             float64 `json:"tp"`
	RR             float64 `json:"rr"`
	Confidence     int     `json:"confidence"`
	Thoughts       string  `json:"thoughts"`
	Leverage       int     `json:"leverage"`
	Status         string  `json:"status"`
	Timestamp      string  `json:"timestamp"`
	ExecutedAt     *string `json:"executedAt,omitempty"`
	TransactionId  string  `json:"transactionId,omitempty"`
	ExecutionPrice float64 `json:"executionPrice,omitempty"`
	IsTestnet      bool    `json:"isTestnet"`
}

func (ts *TradingSignal) ToResponse() TradingSignalResponse {
	response := TradingSignalResponse{
		ID:             ts.ID.Hex(),
		Symbol:         ts.Symbol,
		Direction:      ts.Direction,
		Entry:          ts.Entry,
		SL:             ts.SL,
		TP:             ts.TP,
		RR:             ts.RR,
		Confidence:     ts.Confidence,
		Thoughts:       ts.Thoughts,
		Leverage:       ts.Leverage,
		Status:         ts.Status,
		Timestamp:      ts.CreatedAt.Format(time.RFC3339),
		TransactionId:  ts.TransactionId,
		ExecutionPrice: ts.ExecutionPrice,
		IsTestnet:      ts.IsTestnet,
	}

	if ts.ExecutedAt != nil {
		executedAtStr := ts.ExecutedAt.Format(time.RFC3339)
		response.ExecutedAt = &executedAtStr
	}

	return response
}

type GenerateSignalRequest struct {
	Symbol     string   `json:"symbol" binding:"required"`
	Model      string   `json:"model"`
	Timeframes []string `json:"timeframes"`
}

type GenerateSignalResponse struct {
	Signal TradingSignalResponse `json:"signal"`
}

type ExecuteTradeRequest struct {
	Signal    TradingSignalResponse `json:"signal" binding:"required"`
	IsTestnet bool                  `json:"isTestnet"`
}

type ExecuteTradeResponse struct {
	Success       bool   `json:"success"`
	TransactionId string `json:"transactionId"`
	Message       string `json:"message,omitempty"`
}

type ExecuteManualSignalRequest struct {
	SignalJson string `json:"signalJson" binding:"required"`
	IsTestnet  bool   `json:"isTestnet"`
}

type ExecuteManualSignalResponse struct {
	Success       bool                  `json:"success"`
	Signal        TradingSignalResponse `json:"signal"`
	TransactionId string                `json:"transactionId"`
	Message       string                `json:"message,omitempty"`
}
