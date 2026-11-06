package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
)

// ReconcileUnlistedLogGroup removes unlisted instances from shared duplicate groups.
func (c *Chronicle) ReconcileUnlistedLogGroup(ctx context.Context, logGroupID uuid.UUID) error {
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("load ranking run identities: %w", err)
	}
	affectedIDs := rankingRunLogGroupIdentitySeeds(identities)
	instances, err := c.Zed.GetInstancesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return fmt.Errorf("list instances for unlisted reconciliation: %w", err)
	}
	c.insertParsedInstanceMu.Lock()
	defer c.insertParsedInstanceMu.Unlock()
	if err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
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
		return nil
	}, nil); err != nil {
		return err
	}
	return c.EnqueueRankingRunRefresh(ctx, affectedIDs...)
}
