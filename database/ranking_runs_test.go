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

type pausingRankingRunSourceStore struct {
	database.Store
	snapshotRead chan struct{}
	release      chan struct{}
	snapshotOnce sync.Once
}

func (s *pausingRankingRunSourceStore) InTx(ctx context.Context, f func(database.Store) error, opts *pgx.TxOptions) error {
	return s.Store.InTx(ctx, func(tx database.Store) error {
		return f(&pausingRankingRunSourceTx{Store: tx, parent: s})
	}, opts)
}

type pausingRankingRunSourceTx struct {
	database.Store
	parent *pausingRankingRunSourceStore
}

func (tx *pausingRankingRunSourceTx) RankingRunSources(ctx context.Context, affectedIDs []uuid.UUID) ([]database.RankingRunSourcesRow, error) {
	sources, err := tx.Store.RankingRunSources(ctx, affectedIDs)
	if err != nil {
		return nil, err
	}
	tx.parent.snapshotOnce.Do(func() { close(tx.parent.snapshotRead) })
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-tx.parent.release:
		return sources, nil
	}
}

type rankingRunRefreshResult struct {
	output servicerankings.RefreshRankingRunsOutput
	err    error
}

func refreshRankingRunsAsync(ctx context.Context, store database.Store, affectedIDs []uuid.UUID) <-chan rankingRunRefreshResult {
	result := make(chan rankingRunRefreshResult, 1)
	go func() {
		output, err := servicerankings.RefreshRankingRuns(ctx, store, affectedIDs)
		result <- rankingRunRefreshResult{output: output, err: err}
	}()
	return result
}

func observeNewerRefresh(t *testing.T, ctx context.Context, pool *pgxpool.Pool, result <-chan rankingRunRefreshResult) *rankingRunRefreshResult {
	t.Helper()
	const (
		waitTimeout  = 5 * time.Second
		pollInterval = 10 * time.Millisecond
	)
	timer := time.NewTimer(waitTimeout)
	defer timer.Stop()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case refresh := <-result:
			return &refresh
		case <-ticker.C:
			var waiting bool
			err := pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1
					FROM pg_locks
					WHERE locktype = 'advisory'
					  AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
					  AND classid = 1128813135
					  AND objid = 1381322323
					  AND objsubid = 2
					  AND NOT granted
				)
			`).Scan(&waiting)
			require.NoError(t, err)
			if waiting {
				return nil
			}
		case <-timer.C:
			require.FailNow(t, "newer refresh neither completed nor waited for the advisory lock")
		case <-ctx.Done():
			require.FailNow(t, "context expired while observing newer refresh", ctx.Err())
		}
	}
}

func assertRankingRunsMatchSources(t *testing.T, ctx context.Context, pool *pgxpool.Pool, store database.Store, affectedIDs []uuid.UUID) {
	t.Helper()
	sources, err := store.RankingRunSources(ctx, affectedIDs)
	require.NoError(t, err)
	expectedRunIDs := make([]uuid.UUID, 0, len(sources))
	for _, source := range sources {
		expectedRunIDs = append(expectedRunIDs, source.RunID)
	}

	rows, err := pool.Query(ctx, "SELECT run_id FROM ranking_runs ORDER BY run_id")
	require.NoError(t, err)
	defer rows.Close()
	actualRunIDs := make([]uuid.UUID, 0, len(sources))
	for rows.Next() {
		var runID uuid.UUID
		require.NoError(t, rows.Scan(&runID))
		actualRunIDs = append(actualRunIDs, runID)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, expectedRunIDs, actualRunIDs)

	for _, source := range sources {
		run, err := store.RankingRunByID(ctx, source.RunID)
		require.NoError(t, err)
		assert.Equal(t, source.RunID, run.RunID)
		assert.Equal(t, source.RepresentativeInstanceID, run.RepresentativeInstanceID)
		assert.Equal(t, source.RealmID, run.RealmID)
		assert.Equal(t, source.InstanceName, run.InstanceName)
		assert.Equal(t, source.DifficultyName, run.DifficultyName)
		assert.Equal(t, source.MaxPlayers, run.MaxPlayers)
		assert.Equal(t, source.StartTime, run.StartTime)
		assert.Equal(t, source.EndTime, run.EndTime)
		assert.Equal(t, source.BossCoverage, run.BossCoverage)
		assert.Equal(t, source.MemberCount, run.MemberCount)
		assert.Equal(t, source.SourceUpdatedAt, run.SourceUpdatedAt)
	}
}

func TestRankingRunRefreshSerializesSourceTransitions(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name      string
		configure func(context.Context, database.Store, uuid.UUID, uuid.UUID) error
		mutate    func(context.Context, database.Store, uuid.UUID, uuid.UUID) error
	}{
		{
			name: "merge",
			configure: func(context.Context, database.Store, uuid.UUID, uuid.UUID) error {
				return nil
			},
			mutate: func(ctx context.Context, store database.Store, anchorID, duplicateID uuid.UUID) error {
				return store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
					DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true},
					Ids:              []uuid.UUID{anchorID, duplicateID},
				})
			},
		},
		{
			name: "unlink",
			configure: func(ctx context.Context, store database.Store, anchorID, duplicateID uuid.UUID) error {
				return store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
					DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true},
					Ids:              []uuid.UUID{anchorID, duplicateID},
				})
			},
			mutate: func(ctx context.Context, store database.Store, _ uuid.UUID, duplicateID uuid.UUID) error {
				return store.ClearDuplicateGroupID(ctx, duplicateID)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			pool, store, realmID := setupParsesTest(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			anchorID := uuid.New()
			duplicateID := uuid.New()
			affectedIDs := []uuid.UUID{anchorID, duplicateID}
			start := time.Date(2026, 9, 5, 20, 0, 0, 0, time.UTC)
			insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron")
			insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Second), "Lucifron", "Ragnaros")
			require.NoError(t, test.configure(ctx, store, anchorID, duplicateID))
			_, err := servicerankings.RefreshRankingRuns(ctx, store, affectedIDs)
			require.NoError(t, err)

			pausedStore := &pausingRankingRunSourceStore{
				Store: store, snapshotRead: make(chan struct{}), release: make(chan struct{}),
			}
			var releaseOnce sync.Once
			release := func() { releaseOnce.Do(func() { close(pausedStore.release) }) }
			t.Cleanup(release)
			oldRefresh := refreshRankingRunsAsync(ctx, pausedStore, affectedIDs)
			select {
			case <-pausedStore.snapshotRead:
			case <-ctx.Done():
				require.FailNow(t, "old refresh did not read its source snapshot", ctx.Err())
			}

			require.NoError(t, test.mutate(ctx, store, anchorID, duplicateID))
			newRefresh := refreshRankingRunsAsync(ctx, store, affectedIDs)
			newRefreshResult := observeNewerRefresh(t, ctx, pool, newRefresh)
			release()

			oldRefreshResult := <-oldRefresh
			require.NoError(t, oldRefreshResult.err)
			if newRefreshResult == nil {
				result := <-newRefresh
				newRefreshResult = &result
			}
			require.NoError(t, newRefreshResult.err)
			assertRankingRunsMatchSources(t, ctx, pool, store, affectedIDs)
		})
	}
}

type rankingConsumerResults struct {
	summaries   []database.RankingsInstanceSummariesRow
	encounters  []database.RankingsEncounterListRow
	leaderboard []database.RankingsLeaderboardRow
	boxplots    []database.RankingsBoxPlotStatsRow
}

func readRankingConsumers(t *testing.T, store database.Store, tenantID uuid.UUID) rankingConsumerResults {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitMedium)
	require.NoError(t, store.UpsertRankingsInstanceSummary(ctx, database.UpsertRankingsInstanceSummaryParams{
		InstanceName: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40,
		TenantID: tenantID, QueryVersion: 1,
	}))
	summaries, err := store.RankingsInstanceSummaries(ctx, tenantID)
	require.NoError(t, err)
	encounters, err := store.RankingsEncounterList(ctx, "Molten Core")
	require.NoError(t, err)
	leaderboard, err := store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{
		Metric: "dps", QueryLimit: 10, InstanceNames: []string{"Molten Core"},
	})
	require.NoError(t, err)
	boxplots, err := store.RankingsBoxPlotStats(ctx, database.RankingsBoxPlotStatsParams{
		Metric: "dps", InstanceNames: []string{"Molten Core"},
	})
	require.NoError(t, err)
	return rankingConsumerResults{
		summaries: summaries, encounters: encounters, leaderboard: leaderboard, boxplots: boxplots,
	}
}

func assertRankingConsumersEqual(t *testing.T, expected, actual rankingConsumerResults) {
	t.Helper()
	assert.Equal(t, expected.summaries, actual.summaries, "ranking summaries")
	assert.Equal(t, expected.encounters, actual.encounters, "encounter list")
	assert.Equal(t, expected.leaderboard, actual.leaderboard, "leaderboard")
	assert.Equal(t, expected.boxplots, actual.boxplots, "boxplots")
}

func TestRankingReadsFallbackFromInvalidPersistedRepresentative(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID := uuid.New()
	anchorA := uuid.New()
	anchorB := uuid.New()
	representativeB := uuid.New()
	start := time.Date(2026, 9, 16, 20, 0, 0, 0, time.UTC)

	insertRankingRunSource(t, pool, store, realmID, anchorA, start, "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, anchorB, start.Add(time.Second), "Lucifron", "Magmadar")
	insertRankingRunSource(t, pool, store, realmID, representativeB, start.Add(2*time.Second), "Lucifron", "Magmadar", "Ragnaros")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorB, Valid: true},
		Ids:              []uuid.UUID{anchorB, representativeB},
	}))

	func() {
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		defer conn.Release()
		_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
		require.NoError(t, err)
		for instanceID, dps := range map[uuid.UUID]float64{
			anchorA: 100, anchorB: 200, representativeB: 900,
		} {
			_, err = conn.Exec(ctx, `
				UPDATE encounter_dps_rankings
				SET damage_done = $2, dps = $3
				WHERE instance_id = $1
			`, instanceID, int64(dps*10), dps)
			require.NoError(t, err)
		}
	}()

	fallback := readRankingConsumers(t, store, tenantID)
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{anchorA, anchorB, representativeB})
	require.NoError(t, err)
	require.Len(t, sources, 2)
	var sourceB database.RankingRunSourcesRow
	for _, source := range sources {
		upsertRankingRunSource(t, store, source)
		if source.RunID == anchorB {
			sourceB = source
		}
	}
	require.Equal(t, representativeB, sourceB.RepresentativeInstanceID)
	persisted := readRankingConsumers(t, store, tenantID)
	assertRankingConsumersEqual(t, fallback, persisted)

	// Move the persisted representative from run B into run A without refreshing
	// ranking_runs. Reads must ignore B's stale row and use B's fallback representative.
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: anchorA, Valid: true},
		Ids:              []uuid.UUID{representativeB},
	}))
	_, err = pool.Exec(ctx, "DELETE FROM ranking_runs WHERE run_id = $1", anchorB)
	require.NoError(t, err)
	transitionFallback := readRankingConsumers(t, store, tenantID)
	upsertRankingRunSource(t, store, sourceB)
	transitionPersisted := readRankingConsumers(t, store, tenantID)
	assertRankingConsumersEqual(t, transitionFallback, transitionPersisted)
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

	_, err = store.UnlinkDuplicateGroup(ctx, duplicateID)
	require.NoError(t, err)
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

func TestUnlinkDuplicateGroupMaintainsDistinctRankingRunIdentities(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		memberCount int
		unlinkIndex int
	}{
		{name: "two member anchor", memberCount: 2, unlinkIndex: 0},
		{name: "larger group anchor", memberCount: 3, unlinkIndex: 0},
		{name: "two member non-anchor", memberCount: 2, unlinkIndex: 1},
		{name: "larger group non-anchor", memberCount: 3, unlinkIndex: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			pool, store, realmID := setupParsesTest(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			start := time.Date(2026, 9, 16, 20, 0, 0, 0, time.UTC)
			instanceIDs := make([]uuid.UUID, tt.memberCount)
			for i := range instanceIDs {
				instanceIDs[i] = uuid.New()
				insertRankingRunSource(t, pool, store, realmID, instanceIDs[i], start.Add(time.Duration(i)*time.Second), "Lucifron")
			}
			anchorID := instanceIDs[0]
			require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
				DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true},
				Ids:              instanceIDs,
			}))
			_, err := servicerankings.RefreshRankingRuns(ctx, store, instanceIDs)
			require.NoError(t, err)

			unlinkedID := instanceIDs[tt.unlinkIndex]
			result, err := store.UnlinkDuplicateGroup(ctx, unlinkedID)
			require.NoError(t, err)
			require.Equal(t, uuid.NullUUID{UUID: anchorID, Valid: true}, result.PreviousGroupID)

			expectedGroupID := anchorID
			if tt.unlinkIndex == 0 {
				expectedGroupID = instanceIDs[1]
				require.Equal(t, uuid.NullUUID{UUID: expectedGroupID, Valid: true}, result.NewGroupID)
			} else {
				require.False(t, result.NewGroupID.Valid)
			}

			refresh, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{
				unlinkedID,
				result.PreviousGroupID.UUID,
				result.NewGroupID.UUID,
			})
			require.NoError(t, err)
			require.Equal(t, 2, refresh.ResolvedRunCount)

			for i, instanceID := range instanceIDs {
				instance, err := store.Instance(ctx, instanceID)
				require.NoError(t, err)
				if i == tt.unlinkIndex {
					require.False(t, instance.DuplicateGroupID.Valid)
					continue
				}
				require.Equal(t, uuid.NullUUID{UUID: expectedGroupID, Valid: true}, instance.DuplicateGroupID)
			}

			duplicates, err := store.ListInstancesByDuplicateGroup(ctx, uuid.NullUUID{UUID: expectedGroupID, Valid: true})
			require.NoError(t, err)
			require.Len(t, duplicates, tt.memberCount-1)

			runIDs := []uuid.UUID{unlinkedID, expectedGroupID}
			for _, runID := range runIDs {
				_, err := store.RankingRunByID(ctx, runID)
				require.NoError(t, err)
			}
			var persistedRunCount int
			require.NoError(t, pool.QueryRow(ctx, "SELECT COUNT(*) FROM ranking_runs").Scan(&persistedRunCount))
			require.Equal(t, 2, persistedRunCount)
		})
	}
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

func TestRankingRunRepairSignalAfterDeletion(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name             string
		anchorUpdatedAt  time.Time
		deletedUpdatedAt time.Time
	}{
		{
			name:             "non-representative member",
			anchorUpdatedAt:  time.Date(2026, 9, 16, 10, 1, 0, 0, time.UTC),
			deletedUpdatedAt: time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC),
		},
		{
			name:             "newest-timestamp member",
			anchorUpdatedAt:  time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC),
			deletedUpdatedAt: time.Date(2026, 9, 16, 10, 1, 0, 0, time.UTC),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool, store, realmID := setupParsesTest(t)
			ctx := testutil.Context(t, testutil.WaitMedium)
			anchorID := uuid.New()
			deletedID := uuid.New()
			start := time.Date(2026, 9, 16, 9, 0, 0, 0, time.UTC)
			insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Lucifron", "Magmadar")
			insertRankingRunSource(t, pool, store, realmID, deletedID, start.Add(time.Second), "Lucifron")
			require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
				DuplicateGroupID: uuid.NullUUID{UUID: anchorID, Valid: true}, Ids: []uuid.UUID{anchorID, deletedID},
			}))

			conn, err := pool.Acquire(ctx)
			require.NoError(t, err)
			_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
			require.NoError(t, err)
			_, err = conn.Exec(ctx, `UPDATE log_instances SET updated_at = CASE id WHEN $1 THEN $2::timestamptz ELSE $3::timestamptz END WHERE id = ANY($4)`,
				anchorID, tc.anchorUpdatedAt, tc.deletedUpdatedAt, []uuid.UUID{anchorID, deletedID})
			conn.Release()
			require.NoError(t, err)

			_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID})
			require.NoError(t, err)
			before, err := store.RankingRunByID(ctx, anchorID)
			require.NoError(t, err)
			assert.Equal(t, int32(2), before.MemberCount)

			// Simulate losing the targeted refresh enqueue after the delete. The
			// statement trigger must leave enough state for incremental repair.
			_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{deletedID})
			require.NoError(t, err)
			repairs, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
				SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
			})
			require.NoError(t, err)
			require.Len(t, repairs, 1)
			assert.Equal(t, anchorID, repairs[0].RunID)
			assert.True(t, repairs[0].Stale)

			_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{repairs[0].RunID})
			require.NoError(t, err)
			after, err := store.RankingRunByID(ctx, anchorID)
			require.NoError(t, err)
			assert.Equal(t, int32(1), after.MemberCount)
			assert.True(t, after.SourceUpdatedAt.Time.After(before.SourceUpdatedAt.Time))
		})
	}
}

func TestRankingRunRepairSignalAfterIdentityTransitions(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	oldRunID := uuid.New()
	movedID := uuid.New()
	newRunID := uuid.New()
	start := time.Date(2026, 9, 16, 11, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realmID, oldRunID, start, "Lucifron", "Magmadar")
	insertRankingRunSource(t, pool, store, realmID, movedID, start.Add(time.Second), "Lucifron")
	insertRankingRunSource(t, pool, store, realmID, newRunID, start.Add(2*time.Second), "Lucifron", "Magmadar")
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: oldRunID, Valid: true}, Ids: []uuid.UUID{oldRunID, movedID},
	}))
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: newRunID, Valid: true}, Ids: []uuid.UUID{newRunID},
	}))
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{oldRunID, newRunID})
	require.NoError(t, err)

	// Reassign one member. Incremental repair must discover both the old and
	// new logical identities even if the targeted enqueue is missed.
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: newRunID, Valid: true}, Ids: []uuid.UUID{movedID},
	}))
	repairs, err := store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
	})
	require.NoError(t, err)
	repairIDs := make([]uuid.UUID, 0, len(repairs))
	for _, repair := range repairs {
		repairIDs = append(repairIDs, repair.RunID)
		assert.True(t, repair.Stale)
	}
	require.ElementsMatch(t, []uuid.UUID{oldRunID, newRunID}, repairIDs)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, repairIDs)
	require.NoError(t, err)
	oldRun, err := store.RankingRunByID(ctx, oldRunID)
	require.NoError(t, err)
	newRun, err := store.RankingRunByID(ctx, newRunID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), oldRun.MemberCount)
	assert.Equal(t, int32(2), newRun.MemberCount)

	// Unlink the member. The old group needs a survivor touch while the new
	// standalone identity is found as a missing projection.
	require.NoError(t, store.ClearDuplicateGroupID(ctx, movedID))
	repairs, err = store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
		SourceCutoff: database.Timestamptz(time.Now().Add(time.Hour)), QueryLimit: 10,
	})
	require.NoError(t, err)
	repairIDs = repairIDs[:0]
	for _, repair := range repairs {
		repairIDs = append(repairIDs, repair.RunID)
	}
	require.ElementsMatch(t, []uuid.UUID{newRunID, movedID}, repairIDs)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, repairIDs)
	require.NoError(t, err)
	newRun, err = store.RankingRunByID(ctx, newRunID)
	require.NoError(t, err)
	standalone, err := store.RankingRunByID(ctx, movedID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), newRun.MemberCount)
	assert.Equal(t, int32(1), standalone.MemberCount)
}

func TestRankingRunRepairSignalWritesAtMostOneSurvivorPerRun(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	start := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	type runMembers struct {
		runID   uuid.UUID
		keepIDs []uuid.UUID
		delete  uuid.UUID
	}
	runs := make([]runMembers, 2)
	allIDs := make([]uuid.UUID, 0, 6)
	deleteIDs := make([]uuid.UUID, 0, 2)
	for i := range runs {
		runs[i] = runMembers{
			runID:   uuid.New(),
			keepIDs: []uuid.UUID{uuid.New(), uuid.New()},
			delete:  uuid.New(),
		}
		ids := []uuid.UUID{runs[i].runID, runs[i].keepIDs[0], runs[i].keepIDs[1], runs[i].delete}
		for j, id := range ids {
			insertRankingRunSource(t, pool, store, realmID, id, start.Add(time.Duration(i*10+j)*time.Second), "Lucifron")
		}
		require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
			DuplicateGroupID: uuid.NullUUID{UUID: runs[i].runID, Valid: true}, Ids: ids,
		}))
		allIDs = append(allIDs, ids...)
		deleteIDs = append(deleteIDs, runs[i].delete)
	}

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	baseline := time.Date(2026, 9, 16, 12, 30, 0, 0, time.UTC)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET updated_at = $1 WHERE id = ANY($2)", baseline, allIDs)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "DELETE FROM log_instances WHERE id = ANY($1)", deleteIDs)
	require.NoError(t, err)

	for _, run := range runs {
		var touched int
		err = conn.QueryRow(ctx, `
			SELECT COUNT(*)
			FROM log_instances
			WHERE (id = $1 OR duplicate_group_id = $1)
			  AND updated_at > $2`, run.runID, baseline).Scan(&touched)
		require.NoError(t, err)
		assert.Equal(t, 1, touched)
	}
	conn.Release()
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
