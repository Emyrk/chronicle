package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const rankingRunRepairSafetyBound = int32(10_000)

type RefreshRankingRunsOutput struct {
	AffectedIDCount  int   `json:"affected_id_count"`
	ResolvedRunCount int   `json:"resolved_run_count"`
	CreatedCount     int64 `json:"created_count"`
	UpdatedCount     int64 `json:"updated_count"`
	UnchangedCount   int64 `json:"unchanged_count"`
	DeletedCount     int64 `json:"deleted_count"`
	DurationMS       int64 `json:"duration_ms"`
}

type RepairRankingRunsOutput struct {
	DiscoveredCount       int   `json:"discovered_count"`
	MissingCount          int   `json:"missing_count"`
	StaleCount            int   `json:"stale_count"`
	InvalidRepresentative int   `json:"invalid_representative_count"`
	OrphanCount           int   `json:"orphan_count"`
	ResolvedRunCount      int   `json:"resolved_run_count"`
	CreatedCount          int64 `json:"created_count"`
	UpdatedCount          int64 `json:"updated_count"`
	UnchangedCount        int64 `json:"unchanged_count"`
	DeletedCount          int64 `json:"deleted_count"`
	DurationMS            int64 `json:"duration_ms"`
}

type WorkerRefreshRankingRuns struct {
	river.WorkerDefaults[rankingargs.ArgsRefreshRankingRuns]
	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerRefreshRankingRuns) Work(ctx context.Context, job *river.Job[rankingargs.ArgsRefreshRankingRuns]) error {
	started := time.Now()
	output, err := RefreshRankingRuns(ctx, w.Store, job.Args.AffectedIDs)
	output.DurationMS = time.Since(started).Milliseconds()
	_ = river.RecordOutput(ctx, output)
	return err
}

func RefreshRankingRuns(ctx context.Context, store database.Store, ids []uuid.UUID) (RefreshRankingRunsOutput, error) {
	ctx = servicetenant.AdminBypass(ctx)
	affectedIDs := rankingargs.NormalizeIDs(ids)
	if len(affectedIDs) == 0 {
		return RefreshRankingRunsOutput{}, nil
	}

	var output RefreshRankingRunsOutput
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return fmt.Errorf("acquire ranking run refresh lock: %w", err)
		}
		var err error
		output, err = refreshRankingRunsTx(ctx, tx, affectedIDs)
		return err
	}, nil)
	return output, err
}

// refreshRankingRunsTx applies affected logical-run IDs using a transaction whose
// caller already owns the ranking-run advisory lock.
func refreshRankingRunsTx(ctx context.Context, tx database.Store, ids []uuid.UUID) (RefreshRankingRunsOutput, error) {
	affectedIDs := rankingargs.NormalizeIDs(ids)
	output := RefreshRankingRunsOutput{AffectedIDCount: len(affectedIDs)}
	if len(affectedIDs) == 0 {
		return output, nil
	}

	sources, err := tx.RankingRunSources(ctx, affectedIDs)
	if err != nil {
		return output, fmt.Errorf("resolve ranking run sources: %w", err)
	}
	resolvedRunIDs := make([]uuid.UUID, 0, len(sources))
	representativeInstanceIDs := make([]uuid.UUID, 0, len(sources))
	for _, source := range sources {
		resolvedRunIDs = append(resolvedRunIDs, source.RunID)
		representativeInstanceIDs = append(representativeInstanceIDs, source.RepresentativeInstanceID)
	}
	conflicts, err := tx.DeleteConflictingRankingRunRepresentatives(ctx, database.DeleteConflictingRankingRunRepresentativesParams{
		RunIds:                    resolvedRunIDs,
		RepresentativeInstanceIds: representativeInstanceIDs,
	})
	if err != nil {
		return output, fmt.Errorf("release conflicting ranking run representatives: %w", err)
	}
	deleted, err := tx.DeleteObsoleteRankingRuns(ctx, database.DeleteObsoleteRankingRunsParams{
		AffectedIds:    affectedIDs,
		ResolvedRunIds: resolvedRunIDs,
	})
	if err != nil {
		return output, fmt.Errorf("delete obsolete ranking runs: %w", err)
	}
	output.DeletedCount = int64(len(conflicts) + len(deleted))
	output.ResolvedRunCount = len(sources)

	for _, source := range sources {
		created, err := tx.UpsertRankingRun(ctx, database.UpsertRankingRunParams(source))
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			output.UnchangedCount++
		case err != nil:
			return output, fmt.Errorf("upsert ranking run %s: %w", source.RunID, err)
		case created:
			output.CreatedCount++
		default:
			output.UpdatedCount++
		}
	}
	return output, nil
}

type WorkerRepairRankingRuns struct {
	river.WorkerDefaults[rankingargs.ArgsRepairRankingRuns]
	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerRepairRankingRuns) Work(ctx context.Context, _ *river.Job[rankingargs.ArgsRepairRankingRuns]) error {
	started := time.Now()
	output, err := RepairRankingRuns(ctx, w.Store)
	output.DurationMS = time.Since(started).Milliseconds()
	_ = river.RecordOutput(ctx, output)
	return err
}

func RepairRankingRuns(ctx context.Context, store database.Store) (RepairRankingRunsOutput, error) {
	ctx = servicetenant.AdminBypass(ctx)
	var output RepairRankingRunsOutput
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return fmt.Errorf("acquire ranking run repair lock: %w", err)
		}
		rows, err := tx.RankingRunRepairVerification(ctx, rankingRunRepairSafetyBound)
		if err != nil {
			return fmt.Errorf("discover ranking run repairs: %w", err)
		}
		if len(rows) >= int(rankingRunRepairSafetyBound) {
			return fmt.Errorf("ranking run repair reached safety bound of %d logical runs; refusing partial repair", rankingRunRepairSafetyBound)
		}

		affectedIDs := make([]uuid.UUID, 0, len(rows))
		output.DiscoveredCount = len(rows)
		for _, row := range rows {
			affectedIDs = append(affectedIDs, row.RunID)
			if row.Missing {
				output.MissingCount++
			}
			if row.Stale {
				output.StaleCount++
			}
			if row.InvalidRepresentative {
				output.InvalidRepresentative++
			}
			if row.Orphan {
				output.OrphanCount++
			}
		}

		refresh, err := refreshRankingRunsTx(ctx, tx, affectedIDs)
		if err != nil {
			return fmt.Errorf("repair ranking runs: %w", err)
		}
		output.ResolvedRunCount = refresh.ResolvedRunCount
		output.CreatedCount = refresh.CreatedCount
		output.UpdatedCount = refresh.UpdatedCount
		output.UnchangedCount = refresh.UnchangedCount
		output.DeletedCount = refresh.DeletedCount
		return nil
	}, nil)
	return output, err
}
