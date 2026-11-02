package servicerankings

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// These are safety bounds, not page sizes. Exceeding either aborts the entire
// generation, leaving the previously published scores unchanged.
var ratingRebuildLimits = ratingmath.RebuildLimits{MaxRuns: 10_000, MaxFacts: 100_000}

var ratingActiveJobStates = []rivertype.JobState{
	rivertype.JobStateScheduled,
	rivertype.JobStatePending,
	rivertype.JobStateAvailable,
	rivertype.JobStateRunning,
}

const KindDispatchRatingScores = "dispatch-rating-scores"

type ArgsDispatchRatingScores struct{}

func (ArgsDispatchRatingScores) Kind() string { return KindDispatchRatingScores }
func (ArgsDispatchRatingScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates},
	}
}

type WorkerDispatchRatingScores struct {
	river.WorkerDefaults[ArgsDispatchRatingScores]
	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerDispatchRatingScores) Work(ctx context.Context, _ *river.Job[ArgsDispatchRatingScores]) error {
	ctx = servicetenant.AdminBypass(ctx)
	if w.Queue == nil {
		return fmt.Errorf("rating score dispatch queue is unavailable")
	}
	tenants, err := w.Store.ListRatingScoreTenants(ctx)
	if err != nil {
		return fmt.Errorf("list rating score tenants: %w", err)
	}
	for _, tenant := range tenants {
		// A NULL server tenant is the root tenant, represented by uuid.Nil.
		if _, err := w.Queue.Insert(ctx, ArgsRebuildTenantRatings{TenantID: tenant.UUID}, nil); err != nil {
			return fmt.Errorf("enqueue rating rebuild for tenant %s: %w", tenant.UUID, err)
		}
	}
	return nil
}

const KindRebuildTenantRatings = "rebuild-tenant-ratings"

type ArgsRebuildTenantRatings struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRebuildTenantRatings) Kind() string { return KindRebuildTenantRatings }
func (ArgsRebuildTenantRatings) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates},
	}
}

type WorkerRebuildTenantRatings struct {
	river.WorkerDefaults[ArgsRebuildTenantRatings]
	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerRebuildTenantRatings) Work(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings]) error {
	tenant := job.Args.TenantID
	if tenant != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tenant)
	}
	// One transaction holds the config lock across the build and publication.
	// Config mutations take the same lock via triggers, so no stale policy or
	// realm move can slip between the build and activation. A failure rolls
	// back all staged rows; the publisher's nested InTx reuses this transaction.
	var count int
	var generationID uuid.UUID
	err := w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRatingRebuildConfigLock(ctx); err != nil {
			return fmt.Errorf("acquire rating configuration lock: %w", err)
		}
		generation, written, err := ratingmath.BuildTenantRatings(ctx, tx, tenant, time.Now().UTC(), ratingRebuildLimits)
		if err != nil {
			return fmt.Errorf("build tenant ratings: %w", err)
		}
		if generation.ID == uuid.Nil {
			// Policy removed between dispatch and execution: no generation to publish.
			return nil
		}
		if err := ratingmath.PublishTenantRatings(ctx, tx, tenant, generation.ID); err != nil {
			return fmt.Errorf("publish tenant ratings: %w", err)
		}
		count = written
		generationID = generation.ID
		return nil
	}, nil)
	if err != nil {
		return err
	}
	if generationID != uuid.Nil {
		w.Logger.Info("published tenant ratings", slog.String("tenant_id", tenant.String()),
			slog.String("generation_id", generationID.String()), slog.Int("scores", count))
	}
	return nil
}
