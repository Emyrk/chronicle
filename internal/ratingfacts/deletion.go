package ratingfacts

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

const deletePageSize = 100

// DeleteParsedLogGroupEvidence removes superseded parsed output during a
// reparse. The caller must hold AcquireRankingRunRefreshLock before any parse
// generation row lock; a failed reparse can earn credit again on retry.
func DeleteParsedLogGroupEvidence(ctx context.Context, tx database.Store, logID uuid.UUID) error {
	identities, err := tx.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return err
	}
	instanceIDs := make([]uuid.UUID, 0, len(identities))
	runIDs := make([]uuid.UUID, 0, len(identities))
	for _, identity := range identities {
		instanceIDs = append(instanceIDs, identity.InstanceID)
		runIDs = append(runIDs, identity.RunID)
	}
	realms, err := tx.RatingRealmsByInstanceIDs(ctx, instanceIDs)
	if err != nil {
		return err
	}
	if err := tx.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
		return err
	}
	return ReconcileDeletedRuns(ctx, tx, runIDs, realms)
}

// ReconcileDeletedRuns is called in the same transaction as source deletion,
// under AcquireRankingRunRefreshLock. Removing old facts first and re-earning
// only from remaining canonical sources prevents deleted logs from retaining
// credit, while preserving credit backed by another duplicate upload.
func ReconcileDeletedRuns(ctx context.Context, tx database.Store, runIDs, realmIDs []uuid.UUID) error {
	// The canonical row can still be present even after source deletion; record
	// intent before a later representative refresh removes it. Retries coalesce.
	for start := 0; start < len(runIDs); start += deletePageSize {
		page := runIDs[start:min(start+deletePageSize, len(runIDs))]
		if err := tx.MarkDirtyObservationRunsByIDs(ctx, page); err != nil {
			return fmt.Errorf("mark deleted rating observation runs: %w", err)
		}
	}
	for start := 0; start < len(runIDs); start += deletePageSize {
		page := runIDs[start:min(start+deletePageSize, len(runIDs))]
		if _, err := tx.DeletePlayerRenownFactsForRuns(ctx, page); err != nil {
			return fmt.Errorf("remove player Renown for deleted runs: %w", err)
		}
		if _, err := tx.DeleteGuildRenownFactsForRuns(ctx, page); err != nil {
			return fmt.Errorf("remove guild Renown for deleted runs: %w", err)
		}
		sources, err := tx.RankingRunSources(ctx, page)
		if err != nil {
			return fmt.Errorf("resolve surviving ranking runs: %w", err)
		}
		for _, source := range sources {
			if _, err := tx.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{
				RealmID: source.RealmID, RunID: source.RunID,
				RepresentativeInstanceID: source.RepresentativeInstanceID,
			}); err != nil {
				return fmt.Errorf("restore player Renown from surviving run %s: %w", source.RunID, err)
			}
			if _, err := tx.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{
				TenantID: uuid.Nil, RunID: source.RunID,
				RepresentativeInstanceID: source.RepresentativeInstanceID,
			}); err != nil {
				return fmt.Errorf("restore guild Renown from surviving run %s: %w", source.RunID, err)
			}
		}
	}
	// Any in-progress generation may have staged facts before the delete.
	// Force it stale so it cannot publish credit from removed evidence.
	for start := 0; start < len(realmIDs); start += deletePageSize {
		page := realmIDs[start:min(start+deletePageSize, len(realmIDs))]
		if _, err := tx.BumpRatingConfigRevisionForRealms(ctx, page); err != nil {
			return fmt.Errorf("invalidate rating snapshot after source deletion: %w", err)
		}
	}
	return nil
}
