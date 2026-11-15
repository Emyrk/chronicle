package servicepgxpool

import (
	"context"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"time"
)

// ConnectOnly connects to a provisioned database. It never migrates or starts
// pubsub. The primary deployment owns schema migration.
func ConnectOnly(ctx context.Context, logger *slog.Logger, rawURL string, maxConns int32, options ...database.PoolOption) (*pgxpool.Pool, error) {
	dbURL, err := escapePostgresURLUserInfo(rawURL)
	if err != nil {
		return nil, err
	}
	cfg, ready, err := database.PoolConfig(logger, dbURL, database.WithMaxConns(maxConns))
	if err != nil {
		return nil, err
	}
	// Apply role-specific hooks after PoolConfig installs its defaults.
	for _, option := range options {
		option(cfg)
	}
	ready()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to provisioned parser database: %w", err)
	}
	return pool, nil
}
