package ratingmath

import (
	"context"
	"errors"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

const liveEvidenceBootstrapPageSize int32 = 100

// BootstrapTenantLiveEvidence marks a bounded canonical run page. Ordinary
// evidence reconciliation drains those keys. The completed marker is set only
// after the source scan has ended AND the dirty queue is empty, so active
// Mastery/Peak rows cannot be rewritten from partial historical evidence.
func BootstrapTenantLiveEvidence(ctx context.Context, store database.Store, tenant uuid.UUID, now time.Time) (bool, error) {
	finished := false
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.StartRatingLiveEvidenceBootstrap(ctx, database.StartRatingLiveEvidenceBootstrapParams{
			TenantID: tenant, SourceCutoff: database.Timestamptz(now),
		}); err != nil {
			return err
		}
		state, err := tx.LockRatingLiveEvidenceBootstrap(ctx, tenant)
		if err != nil {
			return err
		}
		if state.CompletedAt.Valid {
			finished = true
			return nil
		}
		page, err := tx.ListRatingLiveBootstrapRunPage(ctx, database.ListRatingLiveBootstrapRunPageParams{
			TenantID: tenant, AfterRunID: state.AfterRunID,
			SourceCutoff: state.SourceCutoff, BatchSize: liveEvidenceBootstrapPageSize,
		})
		if err != nil {
			return err
		}
		if len(page) == 0 {
			n, err := tx.CompleteRatingLiveEvidenceBootstrap(ctx, database.CompleteRatingLiveEvidenceBootstrapParams{
				TenantID: tenant, ExpectedRunID: state.AfterRunID,
			})
			if err != nil {
				return err
			}
			finished = n == 1
			return nil
		}
		if err := tx.MarkDirtyObservationRunsByIDs(ctx, page); err != nil {
			return err
		}
		n, err := tx.AdvanceRatingLiveEvidenceBootstrap(ctx, database.AdvanceRatingLiveEvidenceBootstrapParams{
			TenantID: tenant, ExpectedRunID: state.AfterRunID, AfterRunID: page[len(page)-1],
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return errors.New("live evidence bootstrap cursor changed")
		}
		return nil
	}, nil)
	return finished, err
}
