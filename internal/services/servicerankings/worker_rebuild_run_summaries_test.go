package servicerankings_test

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkerRebuildRankingRunSummaries(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupSnapshotTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	baseTime := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "summary-worker-user"})
	require.NoError(t, err)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(baseTime), UpdatedAt: database.Timestamptz(baseTime),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	canonicalID := uuid.New()
	representativeID := uuid.New()
	for i, instanceID := range []uuid.UUID{canonicalID, representativeID} {
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", StartTime: database.Timestamptz(baseTime.Add(time.Duration(i) * time.Minute)),
			Capabilities: []string{}, DifficultyName: "Raid", MaxPlayers: 40,
		})
		require.NoError(t, err)
	}
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: canonicalID, Valid: true},
		Ids:              []uuid.UUID{canonicalID, representativeID},
	}))

	insert := func(instanceID uuid.UUID, encounterName string, damage, healing, absorbed int64, duration float64, killedAt time.Time) {
		t.Helper()
		encounterID := uuid.New()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: encounterName,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(killedAt.Add(-time.Duration(duration) * time.Second)),
			EndTime:   database.Timestamptz(killedAt),
		})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true}, InstanceID: instanceID,
			EncounterName: encounterName, InstanceName: "Molten Core",
			PlayerGuid: "P-SUMMARY", PlayerName: "Summary Player", PlayerClass: "MAGE",
			PlayerSpec: "Frost", PlayerSubSpec: "Winter", PlayerRole: "dps", PlayerLevel: 60,
			DifficultyName: "Raid", MaxPlayers: 40, RealmID: realmID, RealmName: "test-realm",
			GuildName: "Test Guild", DamageDone: damage, HealingDone: healing, AbsorbedDone: absorbed,
			DurationSecs: duration, Dps: float64(damage) / duration,
			Hps: float64(healing+absorbed) / duration, AvgIlvl: pgtype.Int2{Int16: 72, Valid: true},
			LogHashedSlug: instanceID.String(), KilledAt: database.Timestamptz(killedAt),
		}))
	}

	// The anchor has less boss coverage, so the exact slow-query ordering must
	// choose the complete duplicate as representative.
	insert(canonicalID, "Lucifron", 100, 10, 1, 10, baseTime)
	insert(canonicalID, "Magmadar", 100, 10, 1, 10, baseTime.Add(time.Minute))
	insert(representativeID, "Lucifron", 300, 30, 3, 10, baseTime)
	insert(representativeID, "Magmadar", 600, 60, 6, 20, baseTime.Add(time.Minute))
	insert(representativeID, "Ragnaros", 900, 90, 9, 30, baseTime.Add(2*time.Minute))

	worker := &servicerankings.WorkerRebuildRankingRunSummaries{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))

	adminCtx := servicetenant.AdminBypass(ctx)
	run, err := store.GetRankingRunSummary(adminCtx, canonicalID)
	require.NoError(t, err)
	assert.Equal(t, representativeID, run.RepresentativeInstanceID)
	assert.Equal(t, int32(3), run.BossCoverage)
	assert.ElementsMatch(t, []string{"Lucifron", "Magmadar", "Ragnaros"}, run.EncounterNames)
	assert.Equal(t, servicerankings.RankingPlayerRunSummaryVersion(), run.SummaryVersion)

	players, err := store.ListRankingPlayerRunSummaries(adminCtx, canonicalID)
	require.NoError(t, err)
	require.Len(t, players, 1)
	player := players[0]
	assert.Equal(t, int64(1800), player.DamageDone)
	assert.Equal(t, int64(180), player.HealingDone)
	assert.Equal(t, int64(18), player.AbsorbedDone)
	assert.Equal(t, 60.0, player.DurationSecs)
	assert.Equal(t, 30.0, player.Dps)
	assert.Equal(t, 3.3, player.Hps)
	assert.Equal(t, "Ragnaros", player.EncounterName)
	assert.Equal(t, representativeID.String(), player.LogHashedSlug)
	assert.Equal(t, int16(72), player.AvgIlvl)

	dirty, err := store.ListDirtyRankingRuns(adminCtx, 10)
	require.NoError(t, err)
	assert.Empty(t, dirty)

	// Removing the source group marks the run dirty; the next drain deletes both
	// the run and its cascading player rows.
	require.NoError(t, store.DeleteAllParsedLogsByGroupID(ctx, logGroupID))
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))
	_, err = store.GetRankingRunSummary(adminCtx, canonicalID)
	assert.ErrorIs(t, err, pgx.ErrNoRows)
	players, err = store.ListRankingPlayerRunSummaries(adminCtx, canonicalID)
	require.NoError(t, err)
	assert.Empty(t, players)
}

type trackingRankingStore struct {
	database.Store
	batchSizes []int
}

func (s *trackingRankingStore) ListDirtyRankingRuns(ctx context.Context, batchSize int32) ([]database.ListDirtyRankingRunsRow, error) {
	rows, err := s.Store.ListDirtyRankingRuns(ctx, batchSize)
	s.batchSizes = append(s.batchSizes, len(rows))
	return rows, err
}

func TestWorkerRebuildRankingRunSummariesDrainsMultipleBoundedBatches(t *testing.T) {
	t.Parallel()

	pool, store, _ := setupSnapshotTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	for range 26 {
		_, err := pool.Exec(ctx, `
			INSERT INTO ranking_run_summary_dirty (run_id, generation, last_transaction_id)
			VALUES ($1, 1, pg_current_xact_id())
		`, uuid.New())
		require.NoError(t, err)
	}

	tracking := &trackingRankingStore{Store: store}
	worker := &servicerankings.WorkerRebuildRankingRunSummaries{Store: tracking, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))

	assert.Equal(t, []int{25, 1}, tracking.batchSizes)
	status, err := store.RankingRunSummaryDirtyStatus(servicetenant.AdminBypass(ctx))
	require.NoError(t, err)
	assert.Zero(t, status.QueueDepth)
}

type generationBumpRankingStore struct {
	database.Store
	pool   *pgxpool.Pool
	bumped bool
}

func (s *generationBumpRankingStore) RankingRunSummarySource(ctx context.Context, runID uuid.UUID) ([]database.RankingRunSummarySourceRow, error) {
	rows, err := s.Store.RankingRunSummarySource(ctx, runID)
	if err != nil || s.bumped {
		return rows, err
	}
	s.bumped = true
	_, err = s.pool.Exec(ctx, `
		UPDATE ranking_run_summary_dirty
		SET generation = generation + 1, last_transaction_id = pg_current_xact_id(), updated_at = now()
		WHERE run_id = $1
	`, runID)
	return rows, err
}

func TestWorkerRebuildRankingRunSummariesRetainsChangedGeneration(t *testing.T) {
	t.Parallel()

	pool, store, _ := setupSnapshotTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	runID := uuid.New()
	_, err := pool.Exec(ctx, `
		INSERT INTO ranking_run_summary_dirty (run_id, generation, last_transaction_id)
		VALUES ($1, 1, pg_current_xact_id())
	`, runID)
	require.NoError(t, err)

	bumping := &generationBumpRankingStore{Store: store, pool: pool}
	worker := &servicerankings.WorkerRebuildRankingRunSummaries{Store: bumping, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[rankingargs.ArgsRebuildRankingRunSummaries]{}))

	dirty, err := store.ListDirtyRankingRuns(servicetenant.AdminBypass(ctx), 10)
	require.NoError(t, err)
	require.Len(t, dirty, 1)
	assert.Equal(t, runID, dirty[0].RunID)
	assert.Equal(t, int64(2), dirty[0].Generation)
}

func TestArgsRebuildRankingRunSummariesAreCoalesced(t *testing.T) {
	t.Parallel()

	opts := (rankingargs.ArgsRebuildRankingRunSummaries{}).InsertOpts()
	assert.Equal(t, 5, opts.MaxAttempts)
	assert.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRunning)
	assert.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
}
