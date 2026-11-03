package servicerankings

import (
	"context"
	"encoding/json"
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

// Each step commits at most one bounded evidence, projection, Mastery, or
// raid-scope page. Batch a fixed number of steps per River invocation so a
// large tenant does not create thousands of one-second snoozes. Transactions
// and checkpoint CAS remain page-sized; a later invocation resumes the cursor.
const ratingPagesPerInvocation = 32

func (w *WorkerRebuildTenantRatings) Work(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings]) error {
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	for page := range ratingPagesPerInvocation {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := w.workPage(ctx, job)
		if err == nil {
			w.recordRatingProgress(ctx, job, page+1, "complete")
			return nil
		}
		var snooze *river.JobSnoozeError
		if !errors.As(err, &snooze) {
			w.recordRatingProgress(ctx, job, page+1, "failed")
			return err
		}
	}
	w.recordRatingProgress(ctx, job, ratingPagesPerInvocation, "building")
	return river.JobSnooze(time.Second)
}

// River stores this compact snapshot in metadata.output after each attempt,
// including snoozes. A generation-bound page counter and phase convey progress
// without guessing a percentage before the bounded staging scans finish.
func (w *WorkerRebuildTenantRatings) recordRatingProgress(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings], pages int, status string) {
	tenant := job.Args.TenantID
	output := map[string]any{"tenant_id": tenant, "status": status, "pages_this_attempt": pages}
	var generation uuid.UUID
	if cp, err := w.Store.GetBuildingRatingRebuildCheckpoint(ctx, tenant); err == nil {
		generation = cp.GenerationID
		output["phase"] = cp.Phase
	} else if status == "complete" {
		output["phase"] = "complete"
		generation, _ = w.Store.GetActiveTenantRatingGeneration(ctx, tenant)
	}
	if generation != uuid.Nil {
		output["generation_id"] = generation
	}
	output["pages_processed"] = ratingPagesProcessed(job, generation, pages)
	_ = river.RecordOutput(ctx, output)
}

func ratingPagesProcessed(job *river.Job[ArgsRebuildTenantRatings], generation uuid.UUID, pages int) int {
	if job.JobRow == nil || len(job.Metadata) == 0 || generation == uuid.Nil {
		return pages
	}
	var previous struct {
		Output struct {
			GenerationID   uuid.UUID `json:"generation_id"`
			PagesProcessed int       `json:"pages_processed"`
		} `json:"output"`
	}
	if json.Unmarshal(job.Metadata, &previous) == nil && previous.Output.GenerationID == generation && previous.Output.PagesProcessed > 0 {
		return previous.Output.PagesProcessed + pages
	}
	return pages
}

func (w *WorkerRebuildTenantRatings) workPage(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings]) error {
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
