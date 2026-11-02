package ratingmath

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// renownBackfillStore is satisfied by database.Store. Keeping it narrow lets
// the bounded paging and resumability rules be tested without a full database.
type renownBackfillStore interface {
	ListRenownBackfillRunIDs(context.Context, database.ListRenownBackfillRunIDsParams) ([]uuid.UUID, error)
	BackfillRenownFactsForRun(context.Context, uuid.UUID) (int64, error)
}

// BackfillProgress is a cursor checkpoint. Persist it only after the batch
// finishes; retrying a partly completed batch is safe because facts are unique.
type BackfillProgress struct {
	AfterRunID   uuid.UUID
	RunsScanned  int
	FactsCreated int64
	Done         bool
}

// BackfillRenownFacts scans at most maxBatches of batchSize canonical runs.
// It does not calculate points, and never runs as part of a startup migration.
// Resume from the returned cursor after an interruption or error.
func BackfillRenownFacts(ctx context.Context, store renownBackfillStore, tenantID uuid.UUID, after uuid.UUID, batchSize, maxBatches int32) (BackfillProgress, error) {
	progress := BackfillProgress{AfterRunID: after}
	if tenantID == uuid.Nil || batchSize <= 0 || maxBatches <= 0 {
		return progress, fmt.Errorf("tenant ID, batch size, and batch limit must be nonzero")
	}
	for batch := int32(0); batch < maxBatches; batch++ {
		ids, err := store.ListRenownBackfillRunIDs(ctx, database.ListRenownBackfillRunIDsParams{
			TenantID:   uuid.NullUUID{UUID: tenantID, Valid: true},
			AfterRunID: progress.AfterRunID,
			BatchSize:  batchSize,
		})
		if err != nil {
			return progress, fmt.Errorf("list canonical runs after %s: %w", progress.AfterRunID, err)
		}
		for _, runID := range ids {
			count, err := store.BackfillRenownFactsForRun(ctx, runID)
			if err != nil {
				return progress, fmt.Errorf("backfill run %s: %w", runID, err)
			}
			progress.AfterRunID = runID
			progress.RunsScanned++
			progress.FactsCreated += count
		}
		if int32(len(ids)) < batchSize {
			progress.Done = true
			break
		}
	}
	return progress, nil
}
