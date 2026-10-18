package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
)

// ReconcileLogGroupVisibility synchronizes shared ranking/cohort state after a
// log's visibility changes. Intrinsic per-instance facts are stored regardless
// of visibility; only public logs participate in duplicate groups and cohorts.
func (c *Chronicle) ReconcileLogGroupVisibility(ctx context.Context, logGroupID uuid.UUID, public bool) error {
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list ranking run identities: %w", err)
	}
	affectedIDs := rankingRunLogGroupIdentitySeeds(identities)
	instances, err := c.Zed.GetInstancesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list instances for visibility reconciliation: %w", err)
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
				if public {
					if !instance.StartTime.Valid {
						continue
					}
					players, err := tx.InstancePlayersByInstanceID(ctx, instance.ID)
					if err != nil {
						return fmt.Errorf("list instance players for publication: %w", err)
					}
					participantRows := make([]database.InsertInstancePlayersParams, 0, len(players))
					for _, player := range players {
						participantRows = append(participantRows, database.InsertInstancePlayersParams(player))
					}
					linkedIDs, err := detectAndLinkDuplicate(
						ctx, tx, instance.ID, instance.RealmID, instance.Name,
						instance.MaxPlayers, instance.DynamicDifficulty,
						instance.StartTime, participantRows,
					)
					if err != nil {
						return fmt.Errorf("link published instance duplicates: %w", err)
					}
					affectedIDs = append(affectedIDs, linkedIDs...)
					continue
				}

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
					return fmt.Errorf("refresh parse score memberships after visibility change: %w", err)
				}
				if _, err := tx.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{
					LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				}); err != nil {
					return fmt.Errorf("refresh clear-time memberships after visibility change: %w", err)
				}
				if _, err := tx.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{
					LogGroupID: affectedLogGroupID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
				}); err != nil {
					return fmt.Errorf("refresh boss-kill memberships after visibility change: %w", err)
				}
			}
			return nil
		}, nil)
	}(); err != nil {
		return err
	}

	if err := c.EnqueueRankingRunRefresh(ctx, affectedIDs...); err != nil {
		return err
	}
	if !public || c.queue == nil {
		return nil
	}

	for _, instance := range instances {
		tenantID, err := c.Zed.TenantIDByRealmID(ctx, instance.RealmID)
		if err != nil {
			return fmt.Errorf("resolve tenant for score publication: %w", err)
		}
		if _, err := c.queue.Insert(ctx, parseargs.ArgsComputeParseScores{
			InstanceID: instance.ID,
			TenantID:   tenantID.UUID,
		}, nil); err != nil {
			return fmt.Errorf("enqueue parse score publication: %w", err)
		}
		if _, err := c.queue.Insert(ctx, parseargs.ArgsComputeTimeParseScores{
			InstanceID: instance.ID,
			TenantID:   tenantID.UUID,
			Force:      true,
		}, nil); err != nil {
			return fmt.Errorf("enqueue time parse publication: %w", err)
		}
	}
	return nil
}
