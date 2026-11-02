package database_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRenownFactsAreDurableAndDeduplicated(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Rating Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: server.ID, Name: "Rating Realm",
	})
	require.NoError(t, err)

	// Facts do not reference log_instances or wow_log_groups. The history remains
	// queryable after the underlying log is removed.
	// The historical backfill query is safe to retry when no canonical run exists.
	insertedFromRun, err := store.BackfillRenownFactsForRun(ctx, uuid.New())
	require.NoError(t, err)
	require.Zero(t, insertedFromRun)

	first := database.InsertRenownKillFactParams{
		RealmID: realm.ID, PlayerGuid: "player-a", RunID: uuid.New(),
		InstanceName: "Molten Core", EncounterName: "Ragnaros",
		KilledAt: database.Timestamptz(time.Date(2026, 7, 1, 12, 0, 0, 0, time.UTC)),
	}
	inserted, err := store.InsertRenownKillFact(ctx, first)
	require.NoError(t, err)
	require.Equal(t, int64(1), inserted)
	inserted, err = store.InsertRenownKillFact(ctx, first)
	require.NoError(t, err)
	require.Zero(t, inserted, "duplicate upload must not award twice")

	second := first
	second.RunID = uuid.New()
	second.KilledAt = database.Timestamptz(first.KilledAt.Time.Add(time.Hour))
	inserted, err = store.InsertRenownKillFact(ctx, second)
	require.NoError(t, err)
	require.Equal(t, int64(1), inserted, "a second logical kill on the same day counts")

	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{
		RealmID: realm.ID, PlayerGuid: first.PlayerGuid,
	})
	require.NoError(t, err)
	require.Len(t, facts, 2)
	require.Equal(t, first.RunID, facts[0].RunID)
	require.Equal(t, second.RunID, facts[1].RunID)
}

func TestBossRatingReadsOnlyActiveGeneration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	tenantID := uuid.New()
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Rating Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: server.ID, Name: "Rating Realm",
	})
	require.NoError(t, err)
	generation, err := store.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: tenantID, PolicyVersion: 1, AsOf: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertRatingBossScore(ctx, database.InsertRatingBossScoreParams{
		GenerationID: generation.ID, TenantID: tenantID, RealmID: realm.ID,
		PlayerGuid: "player-a", InstanceName: "Molten Core", EncounterName: "Ragnaros",
		DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: "Warrior",
		PlayerSpec: "Fury", PlayerSubSpec: "", PerformanceMetric: "dps",
		RatingMetric: "peak", WindowKind: "all_time", Score: 91.5,
	}))
	filter := database.ListActiveBossRatingScoresParams{
		TenantID: tenantID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: "Warrior",
		PlayerSpec: "Fury", PlayerSubSpec: "", PerformanceMetric: "dps",
		RatingMetric: "peak", WindowKind: "all_time", LimitCount: 10,
	}
	rows, err := store.ListActiveBossRatingScores(ctx, filter)
	require.NoError(t, err)
	require.Empty(t, rows, "building generation should not be published")

	err = store.InTx(ctx, func(tx database.Store) error {
		if err := tx.RetireActiveRatingScoreGeneration(ctx, tenantID); err != nil {
			return err
		}
		activated, err := tx.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{
			GenerationID: generation.ID, TenantID: tenantID,
		})
		if err != nil {
			return err
		}
		if activated != 1 {
			return fmt.Errorf("expected to activate one generation, got %d", activated)
		}
		return nil
	}, nil)
	require.NoError(t, err)
	rows, err = store.ListActiveBossRatingScores(ctx, filter)
	require.NoError(t, err)
	require.Len(t, rows, 1)

	// A failed publish must roll back retirement of the previous generation.
	err = store.InTx(ctx, func(tx database.Store) error {
		if err := tx.RetireActiveRatingScoreGeneration(ctx, tenantID); err != nil {
			return err
		}
		activated, err := tx.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{
			GenerationID: uuid.New(), TenantID: tenantID,
		})
		if err != nil {
			return err
		}
		if activated != 1 {
			return fmt.Errorf("expected to activate one generation, got %d", activated)
		}
		return nil
	}, nil)
	require.Error(t, err)
	rows, err = store.ListActiveBossRatingScores(ctx, filter)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, 91.5, rows[0].Score)
}

func TestRatingObservationsJoinRawMetricsToLockedParses(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "Ratings Tenant",
		Slug:             pgtype.Text{String: "ratings-" + uuid.NewString()[:8], Valid: true},
		AvailableFormats: []string{},
	})
	require.NoError(t, err)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Ratings Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID: uuid.New(), ServerID: server.ID, Name: "Ratings Realm",
	})
	require.NoError(t, err)

	instanceID := uuid.New()
	killedAt := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	insertRankingRow(t, pool, store, realm.ID, rankingOpts{
		instanceID: instanceID, instanceName: "Molten Core", encounterName: "Ragnaros",
		playerGUID: "Shaman-A", playerClass: "SHAMAN", playerSpec: "Enhancement", playerSubSpec: "Two-Handed",
		difficultyName: "Normal", maxPlayers: 40, damageDone: 10000, healingDone: 1000,
		durationSecs: 10, dps: 1000, hps: 100, killedAt: killedAt, isBoss: true,
	})
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{instanceID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	require.NoError(t, err)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	queries := database.NewQueries(conn)
	require.NoError(t, queries.SetServerTenant(ctx, database.SetServerTenantParams{
		ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant.ID, Valid: true},
	}))

	insertParse := func(metric string, raw, score float64) {
		t.Helper()
		require.NoError(t, queries.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
			TenantID: tenant.ID, InstanceID: instanceID, RunID: sources[0].RunID,
			EncounterName: "Ragnaros", PlayerGuid: "Shaman-A", PlayerName: "Shaman",
			PlayerClass: "SHAMAN", PlayerSpec: "Enhancement", PlayerSubSpec: "Two-Handed",
			Metric: metric, MetricValue: raw, PreciseScore: score, DisplayScore: int16(score),
			Status: "ok", InstanceName: "Molten Core", DifficultyName: "Normal",
			MaxPlayers: 40, KilledAt: database.Timestamptz(killedAt),
		}))
	}
	insertParse("dps", 1000, 92)

	read := func(metric string) database.RatingObservationsForRunRow {
		t.Helper()
		rows, err := queries.RatingObservationsForRun(ctx, database.RatingObservationsForRunParams{
			Metric: metric, TenantID: tenant.ID, RunID: sources[0].RunID,
		})
		require.NoError(t, err)
		require.Len(t, rows, 1)
		return rows[0]
	}
	dps := read("dps")
	require.Equal(t, "Enhancement", dps.PlayerSpec)
	require.Equal(t, "Two-Handed", dps.PlayerSubSpec)
	require.Equal(t, 1000.0, dps.RawValue)
	require.True(t, dps.HasLockedParse)
	require.Equal(t, 92.0, dps.LockedParse)

	insertParse("dps", 1000, 94)
	dps = read("dps")
	require.Equal(t, 94.0, dps.LockedParse, "later locked result replaces earlier scoring without adding a kill")

	hps := read("hps")
	require.Equal(t, 100.0, hps.RawValue)
	require.False(t, hps.HasLockedParse, "raw HPS alone is not a Mastery observation")
	insertParse("hps", 100, 81)
	hps = read("hps")
	require.True(t, hps.HasLockedParse)
	require.Equal(t, 81.0, hps.LockedParse)
}
