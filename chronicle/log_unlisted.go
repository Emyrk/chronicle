package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/internal/services/serviceratings"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
)

// ReconcileUnlistedLogGroup removes unlisted instances from shared duplicate groups.
func (c *Chronicle) ReconcileUnlistedLogGroup(ctx context.Context, logGroupID uuid.UUID) error {
	sourceCtx, resolveErr := serviceratings.GroupSourceContext(ctx, c.Zed, logGroupID)
	if resolveErr != nil {
		return resolveErr
	}
	ctx = sourceCtx
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("load ranking run identities: %w", err)
	}
	affectedIDs := rankingRunLogGroupIdentitySeeds(identities)
	instances, err := c.Zed.GetInstancesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list instances for unlisted reconciliation: %w", err)
	}
	type rankingRunLogGroupStore interface {
		RankingRunLogGroupIDs(context.Context, []uuid.UUID) ([]uuid.UUID, error)
	}

	affectedLogGroups := []uuid.UUID{logGroupID}
	seenLogGroups := map[uuid.UUID]struct{}{logGroupID: {}}
	addAffectedLogGroups := func(db rankingRunLogGroupStore, runIDs []uuid.UUID) error {
		if len(runIDs) == 0 {
			return nil
		}
		ids, err := db.RankingRunLogGroupIDs(ctx, runIDs)
		if err != nil {
			return fmt.Errorf("list affected ranking log groups: %w", err)
		}
		for _, id := range ids {
			if _, ok := seenLogGroups[id]; ok {
				continue
			}
			seenLogGroups[id] = struct{}{}
			affectedLogGroups = append(affectedLogGroups, id)
		}
		return nil
	}
	if err := addAffectedLogGroups(c.Zed, affectedIDs); err != nil {
		return err
	}

	c.insertParsedInstanceMu.Lock()
	defer c.insertParsedInstanceMu.Unlock()
	if err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := serviceratings.EnqueueSourceRepairTx(ctx, tx, affectedIDs); err != nil {
			return err
		}
		for _, instance := range instances {
			if !instance.DuplicateGroupID.Valid {
				continue
			}
			unlinked, err := tx.UnlinkDuplicateGroup(ctx, instance.ID)
			if err != nil {
				return fmt.Errorf("unlink unlisted instance duplicate: %w", err)
			}
			affectedIDs = append(affectedIDs, instance.ID, unlinked.PreviousGroupID.UUID, unlinked.NewGroupID.UUID)
		}
		currentIdentities, err := tx.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
		if err != nil {
			return fmt.Errorf("list reconciled ranking run identities: %w", err)
		}
		affectedIDs = append(affectedIDs, rankingRunLogGroupIdentitySeeds(currentIdentities)...)
		if err := addAffectedLogGroups(tx, affectedIDs); err != nil {
			return err
		}

		for _, affectedLogGroupID := range affectedLogGroups {
			if _, err := tx.RefreshParseScoreMembershipsForLogGroup(ctx, database.RefreshParseScoreMembershipsForLogGroupParams{
				LogGroupID: affectedLogGroupID, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
			}); err != nil {
				return fmt.Errorf("refresh parse score memberships after unlisted change: %w", err)
			}
			if _, err := tx.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
				LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
			}); err != nil {
				return fmt.Errorf("refresh clear-time memberships after unlisted change: %w", err)
			}
			if _, err := tx.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
				LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
			}); err != nil {
				return fmt.Errorf("refresh boss-kill memberships after unlisted change: %w", err)
			}
		}
		if err := serviceratings.EnqueueSourceRepairTx(ctx, tx, affectedIDs); err != nil {
			return err
		}
		return c.EnqueueRankingRunRefreshTx(ctx, tx, affectedIDs...)
	}, nil); err != nil {
		return err
	}
	return nil
}

// MarkWoWLogGroupUnlisted atomically preserves repair work with visibility change.
// Authorization remains with the caller; this does not bypass tenant RLS.
func (c *Chronicle) MarkWoWLogGroupUnlisted(ctx context.Context, logGroupID uuid.UUID) error {
	sourceCtx, err := serviceratings.GroupSourceContext(ctx, c.Zed, logGroupID)
	if err != nil {
		return err
	}
	ctx = sourceCtx
	return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		// Reparse owns this same group row before acquiring D1. Never reverse it.
		if _, err := tx.LockWoWLogGroupParseGeneration(ctx, logGroupID); err != nil {
			return err
		}
		identities, err := tx.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
		if err != nil {
			return err
		}
		if err := serviceratings.EnqueueSourceRepairTx(ctx, tx, rankingRunLogGroupIdentitySeeds(identities)); err != nil {
			return err
		}
		_, err = tx.MarkWoWLogGroupUnlisted(ctx, logGroupID)
		if err != nil {
			return err
		}
		return c.EnqueueRankingRunRefreshTx(ctx, tx, rankingRunLogGroupIdentitySeeds(identities)...)
	}, nil)
}
