package servicepgxpool

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	postgresHealthCheckInterval = 15 * time.Second
	postgresHealthCheckTimeout  = 5 * time.Second
	postgresResetAfterFailures  = 3
)

type poolHealthMonitor interface {
	Ping(context.Context) error
	Reset()
	Stat() *pgxpool.Stat
}

func monitorPoolHealth(ctx context.Context, logger *slog.Logger, pool poolHealthMonitor) {
	ticker := time.NewTicker(postgresHealthCheckInterval)
	defer ticker.Stop()

	consecutiveFailures := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			checkCtx, cancel := context.WithTimeout(ctx, postgresHealthCheckTimeout)
			err := pool.Ping(checkCtx)
			cancel()
			if ctx.Err() != nil {
				return
			}

			stats := pool.Stat()
			if err == nil {
				if consecutiveFailures > 0 {
					logger.InfoContext(ctx, fmt.Sprintf(
						"postgres connectivity recovered after %d failed health checks (%s)",
						consecutiveFailures, formatPoolStats(stats),
					),
						slog.Int("consecutive_failures", consecutiveFailures),
						poolStatsAttr(stats),
					)
				}
				consecutiveFailures = 0
				continue
			}

			consecutiveFailures++
			logger.ErrorContext(ctx, fmt.Sprintf(
				"postgres health check failed (%d consecutive): %v (%s)",
				consecutiveFailures, err, formatPoolStats(stats),
			),
				slog.Any("error", err),
				slog.Int("consecutive_failures", consecutiveFailures),
				poolStatsAttr(stats),
			)

			if shouldResetPool(consecutiveFailures) {
				pool.Reset()
				logger.WarnContext(ctx, fmt.Sprintf(
					"reset postgres connection pool after %d consecutive failed health checks",
					consecutiveFailures,
				),
					slog.Int("consecutive_failures", consecutiveFailures),
					poolStatsAttr(stats),
				)
			}
		}
	}
}

func shouldResetPool(consecutiveFailures int) bool {
	return consecutiveFailures > 0 && consecutiveFailures%postgresResetAfterFailures == 0
}

func poolStatsAttr(stats *pgxpool.Stat) slog.Attr {
	return slog.Group("pool",
		slog.Int64("acquired", int64(stats.AcquiredConns())),
		slog.Int64("idle", int64(stats.IdleConns())),
		slog.Int64("total", int64(stats.TotalConns())),
		slog.Int64("max", int64(stats.MaxConns())),
		slog.Int64("empty_acquires", stats.EmptyAcquireCount()),
		slog.Duration("acquire_duration", stats.AcquireDuration()),
	)
}

func formatPoolStats(stats *pgxpool.Stat) string {
	return fmt.Sprintf(
		"pool acquired=%d idle=%d total=%d max=%d empty_acquires=%d acquire_wait=%s",
		stats.AcquiredConns(),
		stats.IdleConns(),
		stats.TotalConns(),
		stats.MaxConns(),
		stats.EmptyAcquireCount(),
		stats.AcquireDuration(),
	)
}
