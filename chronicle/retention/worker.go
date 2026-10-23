package retention

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/retentionpolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindRetentionRecalculation = "retention-recalculation"
	KindRetentionDeletion      = "retention-deletion"
	DefaultPageSize            = 500
)

type ArgsRetentionRecalculation struct {
	CursorID uuid.UUID `json:"cursor_id"`
	PageSize int       `json:"page_size"`
}

func (ArgsRetentionRecalculation) Kind() string { return KindRetentionRecalculation }
func (ArgsRetentionRecalculation) InsertOpts() river.InsertOpts {
	return retentionInsertOpts()
}

type RecalculationWorker struct {
	river.WorkerDefaults[ArgsRetentionRecalculation]
	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *RecalculationWorker) Work(ctx context.Context, job *river.Job[ArgsRetentionRecalculation]) error {
	pageSize := normalizedPageSize(job.Args.PageSize)
	candidates, err := w.Store.GetRetentionRecalculationCandidates(ctx, database.GetRetentionRecalculationCandidatesParams{
		CursorID: job.Args.CursorID,
		PageSize: int32(pageSize),
	})
	if err != nil {
		return fmt.Errorf("get recalculation candidates: %w", err)
	}
	for _, candidate := range candidates {
		expiresAt := retentionExpiry(candidate.EndTime.Time, candidate.Category.String, candidate.RetentionPolicyKey,
			candidate.HasHonored, candidate.HasRevered, candidate.HasExalted)
		if err := w.Store.UpdateLogInstanceRetentionExpiry(ctx, database.UpdateLogInstanceRetentionExpiryParams{
			ID:                 candidate.ID,
			RetentionExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
		}); err != nil {
			return fmt.Errorf("update retention expiry for %s: %w", candidate.ID, err)
		}
	}
	if len(candidates) == pageSize {
		if _, err := w.Queue.Insert(ctx, ArgsRetentionRecalculation{
			CursorID: candidates[len(candidates)-1].ID,
			PageSize: pageSize,
		}, nil); err != nil {
			return fmt.Errorf("enqueue next recalculation page: %w", err)
		}
	}
	w.Logger.InfoContext(ctx, "recalculated parsed-log retention", slog.Int("instances", len(candidates)))
	return nil
}

type ArgsRetentionDeletion struct {
	CursorExpiresAt time.Time `json:"cursor_expires_at"`
	CursorID        uuid.UUID `json:"cursor_id"`
	PageSize        int       `json:"page_size"`
}

func (ArgsRetentionDeletion) Kind() string { return KindRetentionDeletion }
func (ArgsRetentionDeletion) InsertOpts() river.InsertOpts {
	return retentionInsertOpts()
}

type DeletionWorker struct {
	river.WorkerDefaults[ArgsRetentionDeletion]
	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
	Now    func() time.Time
}

func (w *DeletionWorker) Work(ctx context.Context, job *river.Job[ArgsRetentionDeletion]) error {
	now := time.Now()
	if w.Now != nil {
		now = w.Now()
	}
	pageSize := normalizedPageSize(job.Args.PageSize)
	candidates, err := w.Store.GetExpiredRetentionCandidates(ctx, database.GetExpiredRetentionCandidatesParams{
		Now:             pgtype.Timestamptz{Time: now, Valid: true},
		CursorExpiresAt: pgtype.Timestamptz{Time: job.Args.CursorExpiresAt, Valid: true},
		CursorID:        job.Args.CursorID,
		PageSize:        int32(pageSize),
	})
	if err != nil {
		return fmt.Errorf("get expired candidates: %w", err)
	}

	deleted := 0
	for _, candidate := range candidates {
		var affectedIDs []uuid.UUID
		err := w.Store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockWoWLogGroupParseGeneration(ctx, candidate.LogGroupID); err != nil {
				return err
			}
			generation, err := tx.AdvanceWoWLogGroupParseGeneration(ctx, candidate.LogGroupID)
			if err != nil {
				return err
			}
			if err := tx.CarryForwardFinalizedParsedLogGroup(ctx, database.CarryForwardFinalizedParsedLogGroupParams{
				ID: candidate.LogGroupID, ParseGeneration: generation,
			}); err != nil {
				return err
			}

			authoritative, err := tx.GetAuthoritativeRetentionCandidate(ctx, candidate.ID)
			if errors.Is(err, pgx.ErrNoRows) {
				return nil
			}
			if err != nil {
				return err
			}
			expiresAt := retentionExpiry(authoritative.EndTime.Time, authoritative.Category.String,
				authoritative.RetentionPolicyKey, authoritative.HasHonored, authoritative.HasRevered, authoritative.HasExalted)
			if err := tx.UpdateLogInstanceRetentionExpiry(ctx, database.UpdateLogInstanceRetentionExpiryParams{
				ID:                 authoritative.ID,
				RetentionExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
			}); err != nil {
				return err
			}
			if expiresAt.After(now) {
				return nil
			}
			protected, err := tx.IsRetentionProtectedSpeedrun(ctx, authoritative.ID)
			if err != nil {
				return err
			}
			if protected {
				return nil
			}
			identities, err := tx.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{authoritative.ID})
			if err != nil {
				return err
			}
			for _, identity := range identities {
				affectedIDs = append(affectedIDs, identity.InstanceID, identity.RunID)
			}
			rows, err := tx.DeleteParsedLogInstance(ctx, authoritative.ID)
			if err != nil {
				return err
			}
			if rows > 0 {
				deleted++
			}
			return nil
		}, nil)
		if err != nil {
			return fmt.Errorf("guarded retention deletion for %s: %w", candidate.ID, err)
		}
		if len(affectedIDs) > 0 && w.Queue != nil {
			if _, err := w.Queue.Insert(ctx, rankingargs.NewRefreshRankingRuns(affectedIDs...), nil); err != nil {
				w.Logger.ErrorContext(ctx, "failed to enqueue ranking refresh after retention deletion", slog.Any("error", err))
			}
		}
	}

	if len(candidates) == pageSize {
		last := candidates[len(candidates)-1]
		if _, err := w.Queue.Insert(ctx, ArgsRetentionDeletion{
			CursorExpiresAt: last.RetentionExpiresAt.Time,
			CursorID:        last.ID,
			PageSize:        pageSize,
		}, nil); err != nil {
			return fmt.Errorf("enqueue next deletion page: %w", err)
		}
	}
	w.Logger.InfoContext(ctx, "deleted expired parsed instances", slog.Int("deleted", deleted))
	return nil
}

func retentionInsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: riverconst.QueueRetention, Priority: riverconst.PriorityLow, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{
			rivertype.JobStateScheduled, rivertype.JobStatePending,
			rivertype.JobStateAvailable, rivertype.JobStateRunning,
		}},
	}
}

func normalizedPageSize(size int) int {
	if size <= 0 || size > DefaultPageSize {
		return DefaultPageSize
	}
	return size
}

func retentionExpiry(endTime time.Time, category, policyKey string, honored, revered, exalted bool) time.Time {
	keys := make([]string, 0, 3)
	if honored {
		keys = append(keys, retentionpolicy.EntitlementChronicleHonored)
	}
	if revered {
		keys = append(keys, retentionpolicy.EntitlementChronicleRevered)
	}
	if exalted {
		keys = append(keys, retentionpolicy.EntitlementChronicleExalted)
	}
	return retentionpolicy.RetainUntil(endTime, retentionpolicy.ResolveTier(keys), retentionpolicy.Category(category), retentionpolicy.PolicyKey(policyKey))
}
