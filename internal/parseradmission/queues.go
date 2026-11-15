package parseradmission

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/riverqueue/river"
)

// LocalQueues deliberately excludes River's database-wide pause API.
type LocalQueues interface {
	Add(string, river.QueueConfig) error
	Remove(context.Context, string) error
}

// Watch starts after the initial successful Refresh and queue startup. Removal
// follows revocation/cancellation, and is retried if draining exceeded its bound.
func (g *Gate) Watch(ctx context.Context, queues LocalQueues, name string, config river.QueueConfig, interval time.Duration, logger *slog.Logger) error {
	if interval <= 0 {
		return fmt.Errorf("admission interval must be positive")
	}
	state := queueState{present: true}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	defer g.Close()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
		err := g.Refresh(ctx)
		if err := state.reconcile(ctx, queues, name, config, err == nil, logger); err != nil {
			return err
		}
	}
}

type queueState struct{ present, removing bool }

func (s *queueState) reconcile(ctx context.Context, queues LocalQueues, name string, config river.QueueConfig, compatible bool, logger *slog.Logger) error {
	// A timed-out Remove may already have stopped the producer. Finish removing
	// it even if compatibility recovered, then recreate it rather than leaving
	// a stopped producer installed forever.
	if s.present && (!compatible || s.removing) {
		s.removing = true
		drainCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		err := queues.Remove(drainCtx, name)
		cancel()
		if err != nil {
			logger.Warn("remove local parser queue", "error", err)
			return nil
		}
		s.present, s.removing = false, false
		logger.Warn("parser consumption suspended")
	}
	if compatible && !s.present {
		if err := queues.Add(name, config); err != nil {
			return fmt.Errorf("resume local parser queue: %w", err)
		}
		s.present = true
		logger.Info("parser consumption resumed")
	}
	return nil
}
