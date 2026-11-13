package chronicle

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// ErrDatasetRevisionChanged is retryable: a new attempt must acquire fresh
// dependencies and parse again, never publish the previous attempt's results.
var ErrDatasetRevisionChanged = errors.New("parse dataset revision changed")

var errInvalidDatasetRevision = errors.New("invalid parse dataset revision identity")

type datasetRevisionReader interface {
	GetDatasetRevision(context.Context, uuid.UUID) (int64, error)
}

type datasetRevisionLocker interface {
	// LockDatasetRevision must SELECT the dataset row FOR SHARE in the caller's
	// publication transaction. Writers bump the same row in their mutation tx.
	LockDatasetRevision(context.Context, uuid.UUID) (int64, error)
}

type datasetRevisionFence struct {
	datasetID uuid.UUID
	revision  int64
}

func captureDatasetRevision(ctx context.Context, db datasetRevisionReader, datasetID uuid.UUID) (datasetRevisionFence, error) {
	if datasetID == uuid.Nil {
		return datasetRevisionFence{}, fmt.Errorf("%w: missing dataset UUID", errInvalidDatasetRevision)
	}
	revision, err := db.GetDatasetRevision(ctx, datasetID)
	if err != nil {
		return datasetRevisionFence{}, fmt.Errorf("capture dataset %s revision: %w", datasetID, err)
	}
	fence := datasetRevisionFence{datasetID: datasetID, revision: revision}
	if err := fence.validate(); err != nil {
		return datasetRevisionFence{}, err
	}
	return fence, nil
}

func (f datasetRevisionFence) validate() error {
	if f.datasetID == uuid.Nil || f.revision <= 0 {
		return fmt.Errorf("%w: dataset %s revision %d", errInvalidDatasetRevision, f.datasetID, f.revision)
	}
	return nil
}

func (f datasetRevisionFence) check(ctx context.Context, db datasetRevisionReader) error {
	if err := f.validate(); err != nil {
		return err
	}
	revision, err := db.GetDatasetRevision(ctx, f.datasetID)
	return f.compare(revision, err)
}

// lock checks under a transaction-owned row lock; the lock must remain held
// until publication commits. It performs no cache invalidation or external I/O.
// This fences one publication transaction, not all stages of a multi-tx parse.
func (f datasetRevisionFence) lock(ctx context.Context, tx datasetRevisionLocker) error {
	if err := f.validate(); err != nil {
		return err
	}
	revision, err := tx.LockDatasetRevision(ctx, f.datasetID)
	return f.compare(revision, err)
}

func (f datasetRevisionFence) compare(revision int64, err error) error {
	if validationErr := f.validate(); validationErr != nil {
		return validationErr
	}
	if err != nil {
		return fmt.Errorf("read dataset %s revision: %w", f.datasetID, err)
	}
	if revision <= 0 {
		return fmt.Errorf("%w: observed revision %d", errInvalidDatasetRevision, revision)
	}
	if revision != f.revision {
		return fmt.Errorf("%w: dataset %s, parsed %d, current %d", ErrDatasetRevisionChanged, f.datasetID, f.revision, revision)
	}
	return nil
}
