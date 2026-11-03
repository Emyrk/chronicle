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
	"github.com/prometheus/client_golang/prometheus"
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
	Store           database.Store
	Logger          *slog.Logger
	RebuildDuration prometheus.Observer // Nil in workers constructed outside the service (e.g. tests).
	// PagesPerInvocation caps the steps per River invocation; 0 uses ratingPagesPerInvocation.
	PagesPerInvocation int
}

// Each step commits at most one bounded evidence, projection, Mastery, or
// raid-scope page. Batch a fixed number of steps per River invocation so a
// large tenant does not create thousands of one-second snoozes. Transactions
// and checkpoint CAS remain page-sized; a later invocation resumes the cursor.
const (
	ratingPagesPerInvocation  = 128
	ratingInvocationTimeLimit = 10 * time.Second
)

func (w *WorkerRebuildTenantRatings) Work(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings]) error {
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	started := time.Now()
	pages := 0
	limit := w.PagesPerInvocation
	if limit <= 0 {
		limit = ratingPagesPerInvocation
	}
	for pages < limit && (pages == 0 || time.Since(started) < ratingInvocationTimeLimit) {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := w.workPage(ctx, job)
		pages++
		if err == nil {
			w.recordRatingProgress(ctx, job, pages, "complete", started)
			return nil
		}
		var snooze *river.JobSnoozeError
		if !errors.As(err, &snooze) {
			w.recordRatingProgress(ctx, job, pages, "failed", started)
			return err
		}
	}
	w.recordRatingProgress(ctx, job, pages, "building", started)
	return river.JobSnooze(time.Second)
}

// River stores this compact snapshot in metadata.output after each attempt,
// including snoozes. The only exact remaining count is Mastery subject-windows;
// stage and scope page counts cannot be known before their scans finish.
type ratingPreviousOutput struct {
	GenerationID          uuid.UUID `json:"generation_id"`
	PagesProcessed        int       `json:"pages_processed"`
	ReportedAt            time.Time `json:"reported_at"`
	MasteryWindowsTotal   int32     `json:"mastery_windows_total"`
	MasteryWindowsDone    int64     `json:"mastery_windows_done"`
	MasteryWindowsAtStart int64     `json:"mastery_windows_at_start"`
	MasteryStartedAt      time.Time `json:"mastery_started_at"`
}

func previousRatingOutput(job *river.Job[ArgsRebuildTenantRatings], generation uuid.UUID) ratingPreviousOutput {
	if job.JobRow == nil || len(job.Metadata) == 0 || generation == uuid.Nil {
		return ratingPreviousOutput{}
	}
	var metadata struct {
		Output ratingPreviousOutput `json:"output"`
	}
	if json.Unmarshal(job.Metadata, &metadata) != nil || metadata.Output.GenerationID != generation {
		return ratingPreviousOutput{}
	}
	return metadata.Output
}

func ratingPagesProcessed(job *river.Job[ArgsRebuildTenantRatings], generation uuid.UUID, pages int) int {
	previous := previousRatingOutput(job, generation)
	if previous.PagesProcessed > 0 {
		return previous.PagesProcessed + pages
	}
	return pages
}

func ratingInvocationTiming(pages int, duration time.Duration) map[string]any {
	result := map[string]any{"last_invocation_duration_ms": duration.Milliseconds()}
	if duration > 0 {
		result["last_invocation_pages_per_second"] = float64(pages) / duration.Seconds()
	}
	return result
}

func (w *WorkerRebuildTenantRatings) recordRatingProgress(ctx context.Context, job *river.Job[ArgsRebuildTenantRatings], pages int, status string, started time.Time) {
	tenant := job.Args.TenantID
	// Measure only this invocation's page loop, excluding River's snooze and queue wait.
	duration := time.Since(started)
	now := time.Now().UTC()
	output := map[string]any{"tenant_id": tenant, "status": status, "pages_this_attempt": pages, "reported_at": now}
	for key, value := range ratingInvocationTiming(pages, duration) {
		output[key] = value
	}
	var generation uuid.UUID
	if cp, err := w.Store.GetBuildingRatingRebuildCheckpoint(ctx, tenant); err == nil {
		generation = cp.GenerationID
		output["phase"] = cp.Phase
		if cp.AsOf.Valid && !cp.AsOf.Time.After(now) {
			output["elapsed_seconds"] = int64(now.Sub(cp.AsOf.Time).Seconds())
		}
		if cp.Phase == "mastery_pending" {
			w.recordMasteryProgress(ctx, output, job, cp, now)
		}
	} else if status == "complete" {
		output["phase"] = "complete"
		generation, _ = w.Store.GetActiveTenantRatingGeneration(ctx, tenant)
		if generation != uuid.Nil {
			if cp, err := w.Store.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: generation}); err == nil && cp.AsOf.Valid && !cp.AsOf.Time.After(now) {
				output["elapsed_seconds"] = int64(now.Sub(cp.AsOf.Time).Seconds())
			}
		}
	}
	if generation != uuid.Nil {
		output["generation_id"] = generation
	}
	previous := previousRatingOutput(job, generation)
	processed := ratingPagesProcessed(job, generation, pages)
	output["pages_processed"] = processed
	if elapsed := now.Sub(previous.ReportedAt).Seconds(); previous.PagesProcessed > 0 && elapsed > 0 {
		output["recent_pages_per_second"] = float64(processed-previous.PagesProcessed) / elapsed
	}
	_ = river.RecordOutput(ctx, output)
}

func (w *WorkerRebuildTenantRatings) recordMasteryProgress(ctx context.Context, output map[string]any, job *river.Job[ArgsRebuildTenantRatings], cp database.RatingRebuildCheckpoint, now time.Time) {
	previous := previousRatingOutput(job, cp.GenerationID)
	total := previous.MasteryWindowsTotal
	if total == 0 {
		var err error
		total, err = w.Store.CountTenantMasteryWindows(ctx, database.CountTenantMasteryWindowsParams{
			TargetGenerationID: cp.GenerationID, TargetTenantID: cp.TenantID, AsOf: cp.AsOf,
		})
		if err != nil {
			output["progress_error"] = err.Error()
			return
		}
	}
	done, err := w.Store.CountCompletedTenantMasteryWindows(ctx, database.CountCompletedTenantMasteryWindowsParams{
		GenerationID: cp.GenerationID, TenantID: cp.TenantID,
	})
	if err != nil {
		output["progress_error"] = err.Error()
		return
	}
	output["mastery_windows_total"] = total
	output["mastery_windows_done"] = done
	output["mastery_windows_remaining"] = max(0, int64(total)-done)
	started, baseline := previous.MasteryStartedAt, previous.MasteryWindowsAtStart
	if started.IsZero() {
		started, baseline = now, done
	}
	output["mastery_started_at"] = started
	output["mastery_windows_at_start"] = baseline
	if seconds := now.Sub(started).Seconds(); seconds >= 1 && done > baseline && done < int64(total) {
		rate := float64(done-baseline) / seconds
		output["mastery_windows_per_second"] = rate
		output["mastery_eta_seconds"] = int64(float64(int64(total)-done) / rate)
	}
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
			// Observe only after publication succeeds; the checkpoint's as_of is
			// frozen when the generation starts, so this includes snoozes and retries.
			if w.RebuildDuration != nil && cp.AsOf.Valid {
				if duration := time.Since(cp.AsOf.Time); duration >= 0 {
					w.RebuildDuration.Observe(duration.Seconds())
				}
			}
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
