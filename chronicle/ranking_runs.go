package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/internal/services/serviceratings"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

func (c *Chronicle) EnqueueRankingRunRefresh(ctx context.Context, ids ...uuid.UUID) error {
	args := rankingargs.NewRefreshRankingRuns(ids...)
	if len(args.AffectedIDs) == 0 || c.queue == nil {
		return nil
	}
	if _, err := c.queue.Insert(ctx, args, nil); err != nil {
		return fmt.Errorf("enqueue ranking run refresh: %w", err)
	}
	return nil
}

func rankingRunIdentitySeeds(rows []database.RankingRunIdentitiesByInstanceIDsRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows)*2)
	for _, row := range rows {
		ids = append(ids, row.InstanceID, row.RunID)
	}
	return ids
}

func rankingRunLogGroupIdentitySeeds(rows []database.RankingRunIdentitiesByLogGroupIDRow) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(rows)*2)
	for _, row := range rows {
		ids = append(ids, row.InstanceID, row.RunID)
	}
	return ids
}

// EnqueueRankingRunRefreshTx commits canonical membership repair with its source
// mutation. Missing queue fails closed for tenant-backed leaderboard sources.
// Legacy database-only fixtures with no leaderboard tenant have no such work.
func (c *Chronicle) EnqueueRankingRunRefreshTx(ctx context.Context, tx database.Store, ids ...uuid.UUID) error {
	return serviceratings.EnqueueCanonicalRefreshTx(ctx, tx, c.queue, ids)
}
