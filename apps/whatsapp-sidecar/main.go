package main

import (
	"context"
	"database/sql"
	"os"
	"os/signal"
	"syscall"

	_ "github.com/lib/pq"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"

	"github.com/naija-agent/whatsapp-sidecar/api"
	"github.com/naija-agent/whatsapp-sidecar/manager"
	"github.com/naija-agent/whatsapp-sidecar/queue"
)

func main() {
	// 1. Setup Logging
	log := waLog.Stdout("Main", "INFO", true)
	log.Infof("🚀 [VERSION 1.0.0] WhatsApp Sovereign Sidecar Starting...")

	// 2. Setup Persistence (PostgreSQL)
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Errorf("CRITICAL: DATABASE_URL environment variable is not set")
		os.Exit(1)
	}

	container, err := sqlstore.New(context.Background(), "postgres", dbURL, waLog.Stdout("Database", "ERROR", true))
	if err != nil {
		log.Errorf("Failed to connect to database: %v", err)
		os.Exit(1)
	}

	// Raw SQL DB for Manager
	rawDB, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Errorf("Failed to open raw SQL connection: %v", err)
		os.Exit(1)
	}

	// 3. Setup Redis/BullMQ Publisher
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	publisher, err := queue.NewPublisher(redisURL, "whatsapp-queue", "life-queue")
	if err != nil {
		log.Errorf("Failed to connect to Redis: %v", err)
		os.Exit(1)
	}

	// 4. Initialize Multi-Tenant Manager
	mgr := manager.NewManager(container, rawDB, publisher)

	// 5. Start Internal API (for Outbound)
	apiServer := api.NewServer(mgr)
	go apiServer.Start(os.Getenv("PORT"))

	// 6. Handle OS Signals for Graceful Shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	log.Infof("Shutting down...")
	mgr.Shutdown()
	os.Exit(0)
}
