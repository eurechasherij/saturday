package config

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var DB *mongo.Database

func ConnectDB() error {
	uri := os.Getenv("DATABASE_URL")
	if uri == "" {
		uri = "mongodb://localhost:27017/saturday"
	}

	log.Printf("Database: Connecting to MongoDB at: %s", uri)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Printf("Database: Failed to create MongoDB client: %v", err)
		return err
	}

	// Test the connection
	if err := client.Ping(ctx, nil); err != nil {
		log.Printf("Database: Failed to ping MongoDB: %v", err)
		return err
	}

	DB = client.Database("saturday")
	log.Printf("Database: Successfully connected to MongoDB database: saturday")

	return nil
}