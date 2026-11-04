package serviceriver

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestAggregateRatingCatchupMetrics(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	rows := []database.ListTenantRatingCatchupStatusRow{
		{DirtyRuns: 2, DirtyMastery: 1, PeakPages: 3,
			OldestRun: pgtype.Timestamptz{Time: now.Add(-5 * time.Minute), Valid: true}},
		{DirtyRuns: 4, DirtyRenown: 2, DirtyPeak: 1, PeakPages: 1,
			OldestRun:   pgtype.Timestamptz{Time: now.Add(-9 * time.Minute), Valid: true},
			OldestPeak:  pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
			CompletedAt: pgtype.Timestamptz{Time: now, Valid: true}},
	}
	counts, ages, unfinished, pages := aggregateRatingCatchupMetrics(rows, now)
	require.Equal(t, map[string]int64{"runs": 6, "renown": 2, "mastery": 1, "peak": 1}, counts)
	require.Equal(t, 9*60.0, ages["runs"])
	require.Equal(t, 60.0, ages["peak"])
	require.Zero(t, ages["mastery"])
	require.Equal(t, int64(1), unfinished)
	require.Equal(t, int64(4), pages)
}
