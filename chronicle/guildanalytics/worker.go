package guildanalytics

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/riverqueue/river"
)

const KindCleanup = "guild-resource-analytics-cleanup"

type ArgsCleanup struct{}

func (ArgsCleanup) Kind() string { return KindCleanup }

func (ArgsCleanup) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRetention,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
	}
}

type cleanupStore interface {
	DeleteExpiredGuildResourceVisitors(context.Context) error
}

type CleanupWorker struct {
	river.WorkerDefaults[ArgsCleanup]

	Store cleanupStore
}

func (w *CleanupWorker) Work(ctx context.Context, _ *river.Job[ArgsCleanup]) error {
	if err := w.Store.DeleteExpiredGuildResourceVisitors(ctx); err != nil {
		return fmt.Errorf("delete expired guild resource visitors: %w", err)
	}
	return nil
}
