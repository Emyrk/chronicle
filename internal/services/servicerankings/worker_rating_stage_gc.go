package servicerankings

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const KindRatingStageGC = "rating-stage-gc"

// A distinct token lets a running job enqueue its successor without a
// uniqueness conflict against itself. The daily periodic job repairs any
// missed continuation after a crash or a failed enqueue.
type ArgsRatingStageGC struct {
	Token uuid.UUID `json:"token"`
}

func (ArgsRatingStageGC) Kind() string { return KindRatingStageGC }
func (ArgsRatingStageGC) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRatingStageGC struct {
	river.WorkerDefaults[ArgsRatingStageGC]
	Store database.Store
	Queue *riverqueue.Queues
}

// Work consumes at most one 200-row page from each ephemeral table per job.
// It never deletes generations, checkpoints, or queryable published scores.
func (w *WorkerRatingStageGC) Work(ctx context.Context, _ *river.Job[ArgsRatingStageGC]) error {
	ctx = servicetenant.AdminBypass(ctx)
	if w.Queue == nil {
		return fmt.Errorf("rating stage GC queue is unavailable")
	}
	generation, err := w.Store.NextRetiredRatingStageGeneration(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find retired rating generation: %w", err)
	}
	const size int32 = 200
	if _, err := w.Store.DeleteRetiredRatingStagePlayerObservationsPage(ctx, database.DeleteRetiredRatingStagePlayerObservationsPageParams{GenerationID: generation, BatchSize: size}); err != nil {
		return fmt.Errorf("delete player observations: %w", err)
	}
	if _, err := w.Store.DeleteRetiredRatingStageGuildObservationsPage(ctx, database.DeleteRetiredRatingStageGuildObservationsPageParams{GenerationID: generation, BatchSize: size}); err != nil {
		return fmt.Errorf("delete guild observations: %w", err)
	}
	if _, err := w.Store.DeleteRetiredRatingStagePlayerRenownPage(ctx, database.DeleteRetiredRatingStagePlayerRenownPageParams{GenerationID: generation, BatchSize: size}); err != nil {
		return fmt.Errorf("delete player renown: %w", err)
	}
	if _, err := w.Store.DeleteRetiredRatingStageGuildRenownPage(ctx, database.DeleteRetiredRatingStageGuildRenownPageParams{GenerationID: generation, BatchSize: size}); err != nil {
		return fmt.Errorf("delete guild renown: %w", err)
	}
	if _, err := w.Store.DeleteRetiredRatingStageMasteryAccumulatorsPage(ctx, database.DeleteRetiredRatingStageMasteryAccumulatorsPageParams{GenerationID: generation, BatchSize: size}); err != nil {
		return fmt.Errorf("delete mastery accumulators: %w", err)
	}
	// Query again rather than relying on row counts: another worker may have
	// drained this generation while later retired generations still need work.
	_, err = w.Store.NextRetiredRatingStageGeneration(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find remaining rating stage: %w", err)
	}
	if _, err := w.Queue.Insert(ctx, ArgsRatingStageGC{Token: uuid.New()}, nil); err != nil {
		return fmt.Errorf("enqueue rating stage GC continuation: %w", err)
	}
	return nil
}
