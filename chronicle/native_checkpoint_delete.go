package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// removeAcceptedCheckpointsForDeletion runs only during explicit whole-log
// deletion (including account purge). The caller must hold the log-generation
// row lock through this operation and the metadata cascade. Holding that lock
// during storage I/O deliberately prevents acceptance racing the last batch.
// A storage error aborts deletion and retains metadata for an idempotent retry.
// Raw-file retention must never call this: its durable head remains resumable.
func (c *Chronicle) removeAcceptedCheckpointsForDeletion(ctx context.Context, tx database.Store, logID uuid.UUID) error {
	var after int64
	for {
		attempts, err := tx.ListParserCheckpointAttemptsForDeletion(ctx, database.ListParserCheckpointAttemptsForDeletionParams{LogGroupID: logID, AfterIteration: after})
		if err != nil {
			return fmt.Errorf("list accepted checkpoints for deletion: %w", err)
		}
		if len(attempts) == 0 {
			return nil
		}
		keys := make([]string, len(attempts))
		for i, attempt := range attempts {
			keys[i] = attempt.ObjectKey
		}
		if _, err := c.Storage.RemoveFile(ctx, BucketRaidLogs, keys); err != nil {
			return fmt.Errorf("remove accepted checkpoints: %w", err)
		}
		after = attempts[len(attempts)-1].Iteration
	}
}
