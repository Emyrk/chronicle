package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
)

const (
	KindCleanup = "rate-limit-bucket-cleanup"
	// IdleBucketTTL is how long a bucket may sit untouched before cleanup
	// deletes it. Every limiter must refill completely within this time so a
	// deleted bucket (which comes back full) never loosens a limit.
	IdleBucketTTL = 24 * time.Hour
	// CleanupInterval is how often the cleanup job runs.
	CleanupInterval = time.Hour
)

// ArgsCleanup enqueues deletion of idle buckets.
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
	DeleteIdleRateLimitBuckets(ctx context.Context, idleBefore pgtype.Timestamptz) (int64, error)
}

// CleanupWorker deletes buckets idle for longer than IdleBucketTTL.
type CleanupWorker struct {
	river.WorkerDefaults[ArgsCleanup]

	Store cleanupStore
}

func (w *CleanupWorker) Work(ctx context.Context, _ *river.Job[ArgsCleanup]) error {
	if _, err := w.Store.DeleteIdleRateLimitBuckets(ctx, database.Timestamptz(time.Now().Add(-IdleBucketTTL))); err != nil {
		return fmt.Errorf("delete idle rate limit buckets: %w", err)
	}
	return nil
}
