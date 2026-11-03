package servicerankings

import (
	"context"
	"errors"
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
	tenants, err := w.Store.ListRatingTenants(ctx)
	if err != nil {
		return fmt.Errorf("list rating score tenants: %w", err)
	}
	for _, tenant := range tenants {
		if !tenant.Valid {
			return fmt.Errorf("rating tenant enumeration returned a null tenant")
		}
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

// Every invocation commits at most one bounded tenant evidence, Peak/Renown,
// Mastery, or raid-scope page. River snoozing does not consume an attempt.
func (w *WorkerRebuildTenantRatings) Work(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings]) error {
	tenant := job.Args.TenantID
	if tenant == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, tenant)
	}
	generation, _, err := StageTenantRatingEvidenceStep(ctx, w.Store, tenant, time.Now().UTC())
	if err != nil {
		// The evidence step commits an abort when it detects a stale revision.
		// A later invocation starts a fresh snapshot; never publish the stale build.
		if errors.Is(err, ratingmath.ErrRatingConfigStale) {
			return river.JobSnooze(time.Second)
		}
		return err
	}
	if generation == uuid.Nil {
		return nil
	}
	cp, err := w.Store.GetBuildingTenantProjectionCheckpoint(ctx, database.GetBuildingTenantProjectionCheckpointParams{TenantID: tenant, GenerationID: generation})
	if err != nil {
		return err
	}
	revision, err := w.Store.GetRatingConfigRevision(ctx, tenant)
	if err != nil {
		return err
	}
	if revision != cp.ConfigRevision {
		if _, err := w.Store.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: tenant, GenerationID: generation}); err != nil {
			return err
		}
		return river.JobSnooze(time.Second)
	}
	switch cp.Phase {
	case "runs", "player_renown", "guild_renown":
		// The evidence step above already committed one page.
	case "players", "guilds", "player_renown_scores", "guild_renown_scores":
		_, err = ratingmath.TenantProjectionPage(ctx, w.Store, tenant, generation)
	case "mastery_pending":
		err = ratingmath.TenantMasteryStageStep(ctx, w.Store, tenant, generation)
	case "player_scopes", "guild_scopes":
		err = ratingmath.TenantScopeProjectionPage(ctx, w.Store, tenant, generation)
	case "scopes_complete":
		err = w.Store.InTx(ctx, func(tx database.Store) error {
			// Recheck the configuration inside the ready-transition transaction.
			rev, err := tx.GetRatingConfigRevision(ctx, tenant)
			if err != nil {
				return err
			}
			current, err := tx.GetBuildingTenantProjectionCheckpoint(ctx, database.GetBuildingTenantProjectionCheckpointParams{TenantID: tenant, GenerationID: generation})
			if err != nil {
				return err
			}
			if rev != current.ConfigRevision {
				return ratingmath.ErrRatingConfigStale
			}
			if current.Phase != "scopes_complete" {
				return fmt.Errorf("rating scopes checkpoint changed")
			}
			n, err := tx.AdvanceRatingRebuildCheckpoint(ctx, database.AdvanceRatingRebuildCheckpointParams{
				TenantID: tenant, GenerationID: generation, ExpectedPhase: "scopes_complete", ExpectedCursor: current.Cursor,
				NextPhase: "ready", NextCursor: []byte(`{}`),
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("rating scopes checkpoint changed")
			}
			return nil
		}, nil)
	case "ready":
		var published bool
		published, err = w.Store.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{TenantID: tenant, GenerationID: generation})
		if err == nil && !published {
			err = ratingmath.ErrRatingConfigStale
		}
		if err == nil {
			w.Logger.Info("published tenant ratings", slog.String("tenant_id", tenant.String()), slog.String("generation_id", generation.String()))
			return nil
		}
	default:
		return fmt.Errorf("unexpected rating rebuild phase %q", cp.Phase)
	}
	if errors.Is(err, ratingmath.ErrRatingConfigStale) {
		if _, abortErr := w.Store.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: tenant, GenerationID: generation}); abortErr != nil {
			return abortErr
		}
		return river.JobSnooze(time.Second)
	}
	if err != nil {
		return err
	}
	return river.JobSnooze(time.Second)
}
