package servicerankings_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestWorkerRefreshRankingsSummaryTenant_PrunesStaleSummaryWhenRowCountUnchanged(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupSnapshotTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName:  "Gruul the Dragonkiller",
		instanceName:   "Gruul's Lair",
		playerGUID:     "Player-1",
		playerClass:    "Warrior",
		playerSpec:     "Fury",
		difficultyName: "25 Player",
		maxPlayers:     25,
		damageDone:     100000,
		durationSecs:   100,
		dps:            1000,
		killedAt:       time.Now(),
		isBoss:         true,
	})

	const rowCount = 1
	for _, instanceName := range []string{"Gruul's Lair", "Blackwing Lair"} {
		err := store.UpsertRankingsInstanceSummary(ctx, database.UpsertRankingsInstanceSummaryParams{
			InstanceName:   instanceName,
			DifficultyName: "25 Player",
			MaxPlayers:     25,
			TenantID:       uuid.Nil,
			LastRowCount:   rowCount,
			QueryVersion:   2,
		})
		require.NoError(t, err)
	}

	before, err := store.RankingsInstanceSummaries(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Len(t, before, 2)

	worker := &servicerankings.WorkerRefreshRankingsSummaryTenant{
		Store:  store,
		Logger: slog.Default(),
	}
	err = worker.Work(ctx, &river.Job[servicerankings.ArgsRefreshRankingsSummaryTenant]{
		Args: servicerankings.ArgsRefreshRankingsSummaryTenant{TenantID: uuid.Nil},
	})
	require.NoError(t, err)

	after, err := store.RankingsInstanceSummaries(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Len(t, after, 1)
	require.Equal(t, "Gruul's Lair", after[0].InstanceName)
}
