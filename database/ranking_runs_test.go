package database_test

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func insertRankingRunSource(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID, instanceID uuid.UUID, start time.Time, bosses ...string) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u-" + userID.String()[:8]})
	require.NoError(t, err)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(start), UpdatedAt: database.Timestamptz(start),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40,
		StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(time.Hour)),
		Capabilities: []string{},
	})
	require.NoError(t, err)

	for i, boss := range bosses {
		killedAt := start.Add(time.Duration(i+1) * time.Minute)
		encounterID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: boss, Boss: true,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{},
			StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)),
			EndTime:   database.Timestamptz(killedAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
			EncounterName: boss, InstanceName: "Molten Core", PlayerGuid: "P-" + instanceID.String(),
			PlayerName: "Player", PlayerClass: "MAGE", DifficultyName: "Normal", MaxPlayers: 40,
			RealmID: realmID, RealmName: "test-realm", DamageDone: 1000, DurationSecs: 10, Dps: 100,
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: instanceID.String(),
		}))
	}

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
}

func upsertRankingRunSource(t *testing.T, store database.Store, source database.RankingRunSourcesRow) bool {
	t.Helper()
	created, err := store.UpsertRankingRun(testutil.Context(t, testutil.WaitShort), database.UpsertRankingRunParams(source))
	require.NoError(t, err)
	return created
}

type blockingRankingRunRefreshStore struct {
	database.Store
	started     chan struct{}
	release     chan struct{}
	startedOnce sync.Once
}

func (s *blockingRankingRunRefreshStore) InTx(ctx context.Context, f func(database.Store) error, opts *pgx.TxOptions) error {
	return s.Store.InTx(ctx, func(tx database.Store) error {
		s.startedOnce.Do(func() { close(s.started) })
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-s.release:
		}
		return f(tx)
	}, opts)
}

func TestRankingRunRefreshQueueAllowsIdenticalJobWhileRunning(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	blockingStore := &blockingRankingRunRefreshStore{
		Store:   store,
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(blockingStore.release) }) }
	t.Cleanup(release)

	queue, err := riverqueue.New(ctx, riverqueue.Options{Logger: slog.Default(), Pool: pool})
	require.NoError(t, err)
	riverqueue.AddWorker(queue, &servicerankings.WorkerRefreshRankingRuns{
		Store: blockingStore, Logger: slog.Default(),
	})
	queue.AddQueue(riverqueue.QueueRankings, river.QueueConfig{MaxWorkers: 1})
	require.NoError(t, queue.Start(ctx))
	t.Cleanup(func() { _ = queue.Stop(context.Background()) })

	args := rankingargs.NewRefreshRankingRuns(uuid.New())
	first, err := queue.Insert(ctx, args, nil)
	require.NoError(t, err)
	select {
	case <-ctx.Done():
		require.FailNow(t, "refresh job did not start", ctx.Err())
	case <-blockingStore.started:
	}

	second, err := queue.Insert(ctx, args, nil)
	require.NoError(t, err)
	assert.False(t, second.UniqueSkippedAsDuplicate)
	assert.NotEqual(t, first.Job.ID, second.Job.ID)
	release()
}

func TestRankingRunRepresentativePrefersBroaderDuplicate(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 1, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron", "Magmadar")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Second), "Lucifron", "Magmadar", "Ragnaros")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))

	sources, err := store.RankingRunSources(ctx, []uuid.UUID{duplicateID, anchorID, duplicateID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, anchorID, sources[0].RunID)
	assert.Equal(t, duplicateID, sources[0].RepresentativeInstanceID)
	assert.Equal(t, int32(3), sources[0].BossCoverage)
	assert.Equal(t, int32(2), sources[0].MemberCount)
	assert.True(t, upsertRankingRunSource(t, store, sources[0]))

	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	assert.True(t, errors.Is(err, pgx.ErrNoRows), "unchanged upsert should return no row: %v", err)
	run, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, duplicateID, run.RepresentativeInstanceID)
}

func TestRankingRunRepresentativeTieBreakers(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 2, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start.Add(time.Minute), "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start, "Lucifron")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{anchorID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	assert.Equal(t, anchorID, sources[0].RepresentativeInstanceID, "anchor wins an equal-coverage tie before start time")
}

func TestRankingRunRefreshConvergesAfterReorderUnlinkAndDelete(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 9, 3, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Second), "Lucifron", "Ragnaros")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, duplicateID},
	}))

	created, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{duplicateID, anchorID, duplicateID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), created.CreatedCount)
	repeated, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID, duplicateID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), repeated.UnchangedCount)

	require.NoError(t, store.ClearDuplicateGroupID(ctx, duplicateID))
	unlinked, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{duplicateID, anchorID})
	require.NoError(t, err)
	assert.Equal(t, 2, unlinked.ResolvedRunCount)
	standalone, err := store.RankingRunByID(ctx, duplicateID)
	require.NoError(t, err)
	assert.Equal(t, duplicateID, standalone.RepresentativeInstanceID)
	group, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, anchorID, group.RepresentativeInstanceID)

	identities, err := store.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{duplicateID})
	require.NoError(t, err)
	require.Len(t, identities, 1)
	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{duplicateID})
	require.NoError(t, err)
	deleted, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{identities[0].InstanceID, identities[0].RunID})
	require.NoError(t, err)
	assert.Zero(t, deleted.DeletedCount, "the representative FK cascade removes the standalone row before refresh")
	_, err = store.RankingRunByID(ctx, duplicateID)
	assert.ErrorIs(t, err, pgx.ErrNoRows)
}

func TestRankingRunRefreshMergesGroupsAndReplacesDeletedRepresentative(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	anchorID := uuid.New()
	representativeID := uuid.New()
	otherGroupID := uuid.New()
	start := time.Date(2026, 9, 4, 20, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, representativeID, start.Add(time.Second), "Lucifron", "Magmadar", "Ragnaros")
	insertRankingRunSource(t, pool, store, realmID, otherGroupID, start.Add(2*time.Second), "Lucifron", "Magmadar")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, representativeID},
	}))
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: otherGroupID, Valid: true}, Ids: []uuid.UUID{otherGroupID},
	}))
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID, otherGroupID})
	require.NoError(t, err)

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, otherGroupID},
	}))
	merged, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{otherGroupID, anchorID})
	require.NoError(t, err)
	assert.Equal(t, int64(1), merged.DeletedCount)
	_, err = store.RankingRunByID(ctx, otherGroupID)
	assert.ErrorIs(t, err, pgx.ErrNoRows)

	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{representativeID})
	require.NoError(t, err)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{representativeID, anchorID})
	require.NoError(t, err)
	run, err := store.RankingRunByID(ctx, anchorID)
	require.NoError(t, err)
	assert.Equal(t, otherGroupID, run.RepresentativeInstanceID)
	assert.Equal(t, int32(2), run.BossCoverage)
}

func TestRankingRunRepairDiscoveryCutoffLimitAndOrphans(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	old := time.Now().Add(-2 * time.Hour)
	ids := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for _, id := range ids {
		insertRankingRunSource(t, pool, store, realmID, id, old, "Lucifron")
	}
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET updated_at = $1 WHERE id = ANY($2)", old, ids)
	conn.Release()
	require.NoError(t, err)

	rows, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true}, QueryLimit: 2,
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.True(t, rows[0].Missing)
	assert.True(t, rows[1].Missing)

	recentRows, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: pgtype.Timestamptz{Time: old.Add(-time.Minute), Valid: true}, QueryLimit: 10,
	})
	require.NoError(t, err)
	assert.Empty(t, recentRows)

	sources, err := store.RankingRunSources(ctx, []uuid.UUID{ids[0]})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	orphan := database.UpsertRankingRunParams(sources[0])
	orphan.RunID = uuid.New()
	_, err = store.UpsertRankingRun(ctx, orphan)
	require.NoError(t, err)
	orphans, err := store.OrphanRankingRuns(ctx, 10)
	require.NoError(t, err)
	require.Contains(t, orphans, orphan.RunID)
}
