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

func TestRatingDirtyCountsByTenant(t *testing.T) {
	t.Parallel()
	rows := []database.ListTenantRatingCatchupStatusRow{
		{TenantSlug: "epoch", DirtyRuns: 2, DirtyRenown: 3, DirtyMastery: 4, DirtyPeak: 5},
		{DirtyRuns: 7, DirtyPeak: 1},
	}

	require.Equal(t, map[string]map[string]int64{
		"epoch": {"runs": 2, "renown": 3, "mastery": 4, "peak": 5},
		"root":  {"runs": 7, "renown": 0, "mastery": 0, "peak": 1},
	}, ratingDirtyCountsByTenant(rows))
}

func TestRankingWorkerCountOption(t *testing.T) {
	t.Parallel()

	service := &Service{}
	for _, option := range service.Options() {
		if option.Env == "CHRONICLE_RANKING_WORKERS" {
			require.Equal(t, "1", option.Default)
			require.NoError(t, option.Value.Set("7"))
			require.Equal(t, int64(7), service.rankingWorkers)
			return
		}
	}
	t.Fatal("missing CHRONICLE_RANKING_WORKERS option")
}
