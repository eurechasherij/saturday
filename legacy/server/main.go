package main

import (
	"os"
	"saturday-autotrade/config"
	"saturday-autotrade/routes"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	defer func() {
		if r := recover(); r != nil {
			// Log panic recovery
		}
	}()

	// Load environment variables
	if err := godotenv.Load(); err != nil {
		// No .env file found
	}

	// Connect to database
	if err := config.ConnectDB(); err != nil {
		// Failed to connect to database
	}

	// Initialize Gin router
	router := gin.Default()

	// Add recovery middleware to prevent crashes
	router.Use(gin.Recovery())

	// Setup CORS
	config.SetupCORS(router)

	// Setup routes
	routes.SetupTradingRoutes(router)

	// Health check endpoint
	router.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Get port from environment or default to 3000
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	// Log server starting
	if err := router.Run(":" + port); err != nil {
		// Failed to start server
	}
}
