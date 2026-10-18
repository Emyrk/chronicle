package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
)

// ReconcilePrivateLogGroup removes a newly-private log from shared duplicate,
// ranking, and cohort state. Intrinsic per-instance facts remain persisted.
func (c *Chronicle) ReconcilePrivateLogGroup(ctx context.Context, logGroupID uuid.UUID) error {
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list ranking run identities: %w", err)
	}
	affectedIDs := rankingRunLogGroupIdentitySeeds(identities)
	instances, err := c.Zed.GetInstancesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list instances for privacy reconciliation: %w", err)
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

	if err := func() error {
		c.insertParsedInstanceMu.Lock()
		defer c.insertParsedInstanceMu.Unlock()

		return c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
			for _, instance := range instances {
				if !instance.DuplicateGroupID.Valid {
					continue
				}
				unlinked, err := tx.UnlinkDuplicateGroup(ctx, instance.ID)
				if err != nil {
					return fmt.Errorf("unlink private instance duplicate: %w", err)
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
					return fmt.Errorf("refresh parse score memberships after privacy change: %w", err)
				}
				if _, err := tx.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
					LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				}); err != nil {
					return fmt.Errorf("refresh clear-time memberships after privacy change: %w", err)
				}
				if _, err := tx.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
					LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				}); err != nil {
					return fmt.Errorf("refresh boss-kill memberships after privacy change: %w", err)
				}
			}
			return nil
		}, nil)
	}(); err != nil {
		return err
	}

	return c.EnqueueRankingRunRefresh(ctx, affectedIDs...)
}
