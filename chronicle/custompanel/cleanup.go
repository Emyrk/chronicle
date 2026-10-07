package custompanel

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/riverqueue/river"
)

const KindCleanupReleases = "custom-panel-release-cleanup"

type ArgsCleanupReleases struct{}

func (ArgsCleanupReleases) Kind() string { return KindCleanupReleases }

func (ArgsCleanupReleases) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRetention, Priority: riverconst.PriorityLow, MaxAttempts: 3}
}

type cleanupStore interface {
	DeleteOrphanCustomPanelReleases(context.Context) (int64, error)
}

type CleanupWorker struct {
	river.WorkerDefaults[ArgsCleanupReleases]
	Store cleanupStore
}

func (w *CleanupWorker) Work(ctx context.Context, _ *river.Job[ArgsCleanupReleases]) error {
	if _, err := w.Store.DeleteOrphanCustomPanelReleases(ctx); err != nil {
		return fmt.Errorf("delete orphan custom panel releases: %w", err)
	}
	return nil
}

type MidnightUTCSchedule struct{}

func (MidnightUTCSchedule) Next(current time.Time) time.Time {
	utc := current.UTC()
	return time.Date(utc.Year(), utc.Month(), utc.Day()+1, 0, 0, 0, 0, time.UTC)
}
