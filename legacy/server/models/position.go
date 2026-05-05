package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Position struct {
	ID           primitive.ObjectID `json:"_id,omitempty" bson:"_id,omitempty"`
	Symbol       string             `json:"symbol" bson:"symbol" binding:"required"`
	Direction    string             `json:"direction" bson:"direction" binding:"required,oneof=LONG SHORT"`
	Size         float64            `json:"size" bson:"size" binding:"required,gt=0"`
	EntryPrice   float64            `json:"entryPrice" bson:"entryPrice" binding:"required,gt=0"`
	CurrentPrice float64            `json:"currentPrice" bson:"currentPrice"`
	PnL          float64            `json:"pnl" bson:"pnl"`
	PnLPercentage float64           `json:"pnlPercentage" bson:"pnlPercentage"`
	Leverage     int                `json:"leverage" bson:"leverage" binding:"required,min=1,max=125"`
	Status       string             `json:"status" bson:"status"`
	IsTestnet    bool               `json:"isTestnet" bson:"isTestnet"`
	CreatedAt    time.Time          `json:"timestamp" bson:"createdAt"`
	UpdatedAt    time.Time          `json:"updatedAt" bson:"updatedAt"`

	// Trading details
	OrderId      string    `json:"orderId,omitempty" bson:"orderId,omitempty"`
	StopLoss     float64   `json:"stopLoss,omitempty" bson:"stopLoss,omitempty"`
	TakeProfit   float64   `json:"takeProfit,omitempty" bson:"takeProfit,omitempty"`
	ClosedAt     *time.Time `json:"closedAt,omitempty" bson:"closedAt,omitempty"`
	ClosePrice   float64   `json:"closePrice,omitempty" bson:"closePrice,omitempty"`
}

type PositionResponse struct {
	ID           string  `json:"_id"`
	Symbol       string  `json:"symbol"`
	Direction    string  `json:"direction"`
	Size         float64 `json:"size"`
	EntryPrice   float64 `json:"entryPrice"`
	CurrentPrice float64 `json:"currentPrice"`
	PnL          float64 `json:"pnl"`
	PnLPercentage float64 `json:"pnlPercentage"`
	Leverage     int     `json:"leverage"`
	Status       string  `json:"status"`
	Timestamp    string  `json:"timestamp"`
	ClosedAt     *string `json:"closedAt,omitempty"`
	ClosePrice   float64 `json:"closePrice,omitempty"`
}

func (p *Position) ToResponse() PositionResponse {
	resp := PositionResponse{
		ID:           p.ID.Hex(),
		Symbol:       p.Symbol,
		Direction:    p.Direction,
		Size:         p.Size,
		EntryPrice:   p.EntryPrice,
		CurrentPrice: p.CurrentPrice,
		PnL:          p.PnL,
		PnLPercentage: p.PnLPercentage,
		Leverage:     p.Leverage,
		Status:       p.Status,
		Timestamp:    p.CreatedAt.Format(time.RFC3339),
		ClosePrice:   p.ClosePrice,
	}
	
	if p.ClosedAt != nil {
		closedAtStr := p.ClosedAt.Format(time.RFC3339)
		resp.ClosedAt = &closedAtStr
	}
	
	return resp
}

type CreatePositionRequest struct {
	Symbol     string  `json:"symbol" binding:"required"`
	Direction  string  `json:"direction" binding:"required,oneof=LONG SHORT"`
	Size       float64 `json:"size" binding:"required,gt=0"`
	EntryPrice float64 `json:"entryPrice" binding:"required,gt=0"`
	Leverage   int     `json:"leverage" binding:"required,min=1,max=125"`
	IsTestnet  bool    `json:"isTestnet"`
	StopLoss   float64 `json:"stopLoss,omitempty"`
	TakeProfit float64 `json:"takeProfit,omitempty"`
}

type CreatePositionResponse struct {
	Success  bool             `json:"success"`
	Position PositionResponse `json:"position"`
	Message  string           `json:"message,omitempty"`
}

type ClosePositionRequest struct {
	ClosePrice float64 `json:"closePrice" binding:"required,gt=0"`
}

type ClosePositionResponse struct {
	Success  bool             `json:"success"`
	Position PositionResponse `json:"position"`
	Message  string           `json:"message,omitempty"`
}