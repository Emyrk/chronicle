package chronicle

import (
	"context"
	"fmt"

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
