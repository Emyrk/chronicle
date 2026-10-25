package retention

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindRawLogRetention   = "raw-log-retention"
	DefaultRawLogPageSize = 500
)

// ---------------------------------------------------------------------------
// ArgsRawLogRetention — periodic job that deletes raw log files whose owner
// has a retention policy and whose files are past the retention window.
// The parsed instance data is preserved; only object-storage blobs are removed.
// ---------------------------------------------------------------------------

type ArgsRawLogRetention struct{}

func (ArgsRawLogRetention) Kind() string { return KindRawLogRetention }

func (ArgsRawLogRetention) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRetention,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

// RawLogWorker deletes raw log files from object storage when they exceed the
// owner's configured retention window. The database records are soft-deleted
// (storage_deleted_at is set) so billing and storage queries exclude them.
type RawLogWorker struct {
	river.WorkerDefaults[ArgsRawLogRetention]

	Store   database.Store
	Storage storage.ObjectStorage
	Logger  *slog.Logger
}

func (w *RawLogWorker) Work(ctx context.Context, _ *river.Job[ArgsRawLogRetention]) error {
	logger := w.Logger

	groups, err := w.Store.GetExpiredRawLogGroups(ctx, int32(DefaultRawLogPageSize))
	if err != nil {
		return fmt.Errorf("get expired raw log groups: %w", err)
	}

	if len(groups) == 0 {
		logger.InfoContext(ctx, "no expired raw log groups found")
		return nil
	}

	now := time.Now()
	var deletionErrs []error
	var deleted int
	for _, groupID := range groups {
		// Fence active parsers in a short database transaction before touching
		// external object storage.
		err := w.Store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.LockWoWLogGroupParseGeneration(ctx, groupID); err != nil {
				return err
			}
			generation, err := tx.AdvanceWoWLogGroupParseGeneration(ctx, groupID)
			if err != nil {
				return err
			}
			return tx.CarryForwardFinalizedParsedLogGroup(ctx, database.CarryForwardFinalizedParsedLogGroupParams{
				ID: groupID, ParseGeneration: generation,
			})
		}, nil)
		if err != nil {
			logger.ErrorContext(ctx, "failed to fence raw log deletion",
				slog.String("log_group_id", groupID.String()), slog.String("error", err.Error()))
			continue
		}

		paths := []string{groupID.String()}
		artifacts, err := w.Store.ListLogGroupArtifacts(ctx, groupID)
		if err != nil {
			logger.ErrorContext(ctx, "failed to list raw log artifacts",
				slog.String("log_group_id", groupID.String()), slog.String("error", err.Error()))
			continue
		}
		for _, artifact := range artifacts {
			paths = append(paths, artifact.ObjectKey)
		}
		if _, err := w.Storage.RemoveFile(ctx, "raidlogs", paths); err != nil {
			wrapped := fmt.Errorf("remove raw log group %s from storage: %w", groupID, err)
			logger.ErrorContext(ctx, "failed to remove raw log group from storage",
				slog.String("log_group_id", groupID.String()), slog.String("error", err.Error()))
			deletionErrs = append(deletionErrs, wrapped)
			continue
		}

		// Soft-delete the DB records only after object storage confirms deletion.
		_, err = w.Store.DeleteWoWLogGroupFiles(ctx, database.DeleteWoWLogGroupFilesParams{
			StorageDeletedAt: pgtype.Timestamptz{Time: now, Valid: true},
			WowLogID:         groupID,
		})
		if err != nil {
			logger.ErrorContext(ctx, "failed to soft-delete log group files",
				slog.String("log_group_id", groupID.String()),
				slog.String("error", err.Error()),
			)
			continue
		}
		if _, err := w.Store.MarkLogGroupArtifactsStorageDeleted(ctx, database.MarkLogGroupArtifactsStorageDeletedParams{
			StorageDeletedAt: pgtype.Timestamptz{Time: now, Valid: true},
			LogGroupID:       groupID,
		}); err != nil {
			logger.ErrorContext(ctx, "failed to soft-delete log group artifacts",
				slog.String("log_group_id", groupID.String()),
				slog.String("error", err.Error()),
			)
			continue
		}
		deleted++
	}

	logger.InfoContext(ctx, "raw log retention complete",
		slog.Int("deleted", deleted),
		slog.Int("candidates", len(groups)),
	)

	return errors.Join(deletionErrs...)
}
