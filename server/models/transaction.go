package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Transaction struct {
	ID        primitive.ObjectID `json:"_id,omitempty" bson:"_id,omitempty"`
	Symbol    string             `json:"symbol" bson:"symbol" binding:"required"`
	Type      string             `json:"type" bson:"type" binding:"required,oneof=BUY SELL STOP_LOSS TAKE_PROFIT"`
	Amount    float64            `json:"amount" bson:"amount" binding:"required,gt=0"`
	Price     float64            `json:"price" bson:"price" binding:"required,gt=0"`
	Status    string             `json:"status" bson:"status" binding:"required,oneof=Success Failed Pending"`
	PnL       float64            `json:"pnl,omitempty" bson:"pnl,omitempty"`
	CreatedAt time.Time          `json:"timestamp" bson:"createdAt"`
	UpdatedAt time.Time          `json:"updatedAt" bson:"updatedAt"`

	// Additional fields for tracking
	PositionID   *primitive.ObjectID `json:"positionId,omitempty" bson:"positionId,omitempty"`
	SignalID     *primitive.ObjectID `json:"signalId,omitempty" bson:"signalId,omitempty"`
	IsTestnet    bool                `json:"isTestnet" bson:"isTestnet"`
	OrderID      string              `json:"orderId,omitempty" bson:"orderId,omitempty"`
	Description  string              `json:"description,omitempty" bson:"description,omitempty"`
}

type TransactionResponse struct {
	ID        string  `json:"_id"`
	Symbol    string  `json:"symbol"`
	Type      string  `json:"type"`
	Amount    float64 `json:"amount"`
	Price     float64 `json:"price"`
	Timestamp string  `json:"timestamp"`
	Status    string  `json:"status"`
	PnL       float64 `json:"pnl,omitempty"`
}

func (t *Transaction) ToResponse() TransactionResponse {
	return TransactionResponse{
		ID:        t.ID.Hex(),
		Symbol:    t.Symbol,
		Type:      t.Type,
		Amount:    t.Amount,
		Price:     t.Price,
		Timestamp: t.CreatedAt.Format(time.RFC3339),
		Status:    t.Status,
		PnL:       t.PnL,
	}
}

type CreateTransactionRequest struct {
	Symbol      string  `json:"symbol" binding:"required"`
	Type        string  `json:"type" binding:"required,oneof=BUY SELL STOP_LOSS TAKE_PROFIT"`
	Amount      float64 `json:"amount" binding:"required,gt=0"`
	Price       float64 `json:"price" binding:"required,gt=0"`
	Status      string  `json:"status" binding:"required,oneof=Success Failed Pending"`
	PnL         float64 `json:"pnl,omitempty"`
	PositionID  string  `json:"positionId,omitempty"`
	SignalID    string  `json:"signalId,omitempty"`
	IsTestnet   bool    `json:"isTestnet"`
	OrderID     string  `json:"orderId,omitempty"`
	Description string  `json:"description,omitempty"`
}