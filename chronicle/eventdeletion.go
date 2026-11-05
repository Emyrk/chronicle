package chronicle

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
)

const KindEventObjectDeletion = "event-object-deletion"

type ArgsEventObjectDeletion struct{}

func (ArgsEventObjectDeletion) Kind() string { return KindEventObjectDeletion }

func (ArgsEventObjectDeletion) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverqueue.QueueRetention,
		Priority:    riverqueue.PriorityLow,
		MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
		},
	}
}

type EventObjectDeletionStore interface {
	ListEventObjectDeletionOutbox(context.Context, int32) ([]database.EventObjectDeletionOutbox, error)
	RecordEventObjectDeletionFailure(context.Context, database.RecordEventObjectDeletionFailureParams) error
	DeleteEventObjectDeletionOutbox(context.Context, uuid.UUID) error
}

type WorkerEventObjectDeletion struct {
	Store   EventObjectDeletionStore
	Objects storage.ObjectStorage
	river.WorkerDefaults[ArgsEventObjectDeletion]
}

func (c *Chronicle) NewWorkerEventObjectDeletion() river.Worker[ArgsEventObjectDeletion] {
	return &WorkerEventObjectDeletion{Store: c.Zed, Objects: c.EventStreams.objects}
}

func (w *WorkerEventObjectDeletion) Work(ctx context.Context, _ *river.Job[ArgsEventObjectDeletion]) error {
	rows, err := w.Store.ListEventObjectDeletionOutbox(ctx, 100)
	if err != nil {
		return fmt.Errorf("list event object deletion outbox: %w", err)
	}
	if len(rows) == 0 {
		return nil
	}
	if w.Objects == nil {
		return errors.New("event object deletion requires configured object storage")
	}

	var errs []error
	for _, row := range rows {
		if _, err := w.Objects.RemoveFile(ctx, "", []string{row.ObjectKey}); err != nil {
			if recordErr := w.Store.RecordEventObjectDeletionFailure(ctx, database.RecordEventObjectDeletionFailureParams{
				ID: row.ID, LastError: pgtype.Text{String: err.Error(), Valid: true},
			}); recordErr != nil {
				errs = append(errs, fmt.Errorf("record deletion failure for %s: %w", row.ObjectKey, recordErr))
			}
			errs = append(errs, fmt.Errorf("delete event object %s: %w", row.ObjectKey, err))
			continue
		}
		if err := w.Store.DeleteEventObjectDeletionOutbox(ctx, row.ID); err != nil {
			errs = append(errs, fmt.Errorf("complete deletion for %s: %w", row.ObjectKey, err))
		}
	}
	return errors.Join(errs...)
}
