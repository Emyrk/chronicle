package ratingmath

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

const tenantObservationReconcilePageSize int32 = 25

// ReconcileDirtyTenantObservations replaces one bounded page of canonical
// logical-run evidence. Deletion and insertion triggers record BOTH old and
// new Mastery subjects and Peak cohorts in the same transaction. Serialize
// source reads with representative refresh and CAS-acknowledge only the
// revision actually processed; a later locked-parse write remains queued.
func ReconcileDirtyTenantObservations(ctx context.Context, store database.Store, tenant uuid.UUID) (int, error) {
	var processed int
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return err
		}
		runs, err := tx.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{
			TenantID: tenant, BatchSize: tenantObservationReconcilePageSize,
		})
		if err != nil {
			return err
		}
		for _, run := range runs {
			if _, err := tx.DeleteLivePlayerObservationsForRun(ctx, database.DeleteLivePlayerObservationsForRunParams{
				TenantID: tenant, RunID: run.RunID,
			}); err != nil {
				return fmt.Errorf("retract player evidence for run %s: %w", run.RunID, err)
			}
			if _, err := tx.DeleteLiveGuildObservationsForRun(ctx, database.DeleteLiveGuildObservationsForRunParams{
				TenantID: tenant, RunID: run.RunID,
			}); err != nil {
				return fmt.Errorf("retract guild evidence for run %s: %w", run.RunID, err)
			}
			for _, metric := range []string{"dps", "hps"} {
				if _, err := tx.InsertLivePlayerObservationsForRun(ctx, database.InsertLivePlayerObservationsForRunParams{
					TenantID: tenant, RunID: run.RunID, Metric: metric,
				}); err != nil {
					return fmt.Errorf("stage %s player evidence for run %s: %w", metric, run.RunID, err)
				}
			}
			if _, err := tx.InsertLiveGuildObservationsForRun(ctx, database.InsertLiveGuildObservationsForRunParams{
				TenantID: tenant, RunID: run.RunID,
			}); err != nil {
				return fmt.Errorf("stage guild evidence for run %s: %w", run.RunID, err)
			}
			n, err := tx.DeleteDirtyObservationRunIfRevision(ctx, database.DeleteDirtyObservationRunIfRevisionParams{
				TenantID: tenant, RunID: run.RunID, Revision: run.Revision,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return fmt.Errorf("rating run %s changed during reconciliation", run.RunID)
			}
			processed++
		}
		return nil
	}, nil)
	if err != nil {
		return 0, err
	}
	return processed, nil
}
