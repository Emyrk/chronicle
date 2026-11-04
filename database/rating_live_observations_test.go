package database_test

import (
	"testing"
	"time"

	"errors"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLiveRatingObservationsReplaceOldRunAndMarkAffectedKeys(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	run := uuid.New()
	insertRankingRow(t, pool, store, realm, rankingOpts{
		instanceID: run, instanceName: "Raid", encounterName: "Boss",
		playerGUID: "player", playerClass: "MAGE", difficultyName: "Normal",
		maxPlayers: 40, durationSecs: 10, dps: 100,
		killedAt: time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), isBoss: true,
	})
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{run})
	require.NoError(t, err)
	n, err := ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	var players, guilds, mastery, peaks int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_live_player_observations WHERE run_id=$1", run).Scan(&players))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_live_guild_observations WHERE run_id=$1", run).Scan(&guilds))
	require.Equal(t, 1, players)
	require.Equal(t, 1, guilds, "guildless clean kill still contributes to Peak denominator")
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_mastery_subjects WHERE tenant_id=$1", uuid.Nil).Scan(&mastery))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_peak_cohorts WHERE tenant_id=$1", uuid.Nil).Scan(&peaks))
	require.Equal(t, 1, mastery, "no guild Mastery subject exists for a guildless run")
	require.Equal(t, 2, peaks, "player and guild Peak cohorts are both dirty")
	n, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Zero(t, n, "replay without a change is idempotent")

	// Source invalidation marks the old run before ranking evidence disappears.
	require.NoError(t, store.MarkDirtyObservationRunsByIDs(ctx, []uuid.UUID{run}))
	_, err = pool.Exec(ctx, "UPDATE log_instances SET invalidated_at=now() WHERE id=$1", run)
	require.NoError(t, err)
	n, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_live_player_observations WHERE run_id=$1", run).Scan(&players))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_live_guild_observations WHERE run_id=$1", run).Scan(&guilds))
	require.Zero(t, players)
	require.Zero(t, guilds)
}

func TestLiveRatingObservationDirtyKeySurvivesSourceRollback(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	run := uuid.New()
	insertRankingRunSource(t, pool, store, realm, run, time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), "Boss")
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{run})
	require.NoError(t, err)
	_, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	var subjects int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_mastery_subjects WHERE tenant_id=$1", uuid.Nil).Scan(&subjects))
	require.Greater(t, subjects, 0)
	// A failed source transaction must not add a second durable dirty revision.
	var before int64
	require.NoError(t, pool.QueryRow(ctx, "SELECT max(revision) FROM rating_dirty_mastery_subjects WHERE tenant_id=$1", uuid.Nil).Scan(&before))
	abort := errors.New("abort source update")
	err = store.InTx(ctx, func(tx database.Store) error {
		_, err := tx.DeleteLivePlayerObservationsForRun(ctx, database.DeleteLivePlayerObservationsForRunParams{TenantID: uuid.Nil, RunID: run})
		if err != nil {
			return err
		}
		return abort
	}, nil)
	require.ErrorIs(t, err, abort)
	var after int64
	require.NoError(t, pool.QueryRow(ctx, "SELECT max(revision) FROM rating_dirty_mastery_subjects WHERE tenant_id=$1", uuid.Nil).Scan(&after))
	require.Equal(t, before, after)
}

func TestLiveRatingObservationDirtyKeysRespectTenantRLS(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant := uuid.New()
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: uuid.NewString(), AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: uuid.NewString()})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenant.String())
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'false'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO rating_live_player_observations
		(tenant_id, realm_id, run_id, representative_instance_id, player_guid, instance_name,
		 encounter_name, difficulty_name, max_players, player_class, player_spec,
		 player_sub_spec, performance_metric, killed_at, raw_value, duration_secs)
		VALUES ($1,$2,$3,$4,'player','Raid','Boss','Normal',40,'MAGE','','','dps',now(),100,10)`,
		tenant, realm, uuid.New(), uuid.New())
	require.NoError(t, err)
	for _, table := range []string{"rating_dirty_mastery_subjects", "rating_dirty_peak_cohorts"} {
		var marked uuid.UUID
		require.NoError(t, conn.QueryRow(ctx, "SELECT tenant_id FROM "+table+" WHERE tenant_id=$1", tenant).Scan(&marked))
		require.Equal(t, tenant, marked)
	}
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", uuid.New().String())
	require.NoError(t, err)
	for _, table := range []string{"rating_live_player_observations", "rating_dirty_mastery_subjects", "rating_dirty_peak_cohorts"} {
		var visible int
		require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE tenant_id=$1", tenant).Scan(&visible))
		require.Zero(t, visible, "another tenant cannot see "+table)
	}
}

func TestLiveRatingObservationsRetractMergedDuplicate(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	first, duplicate := uuid.New(), uuid.New()
	start := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realm, first, start, "Boss")
	insertRankingRunSource(t, pool, store, realm, duplicate, start.Add(time.Second), "Boss")
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{first, duplicate})
	require.NoError(t, err)
	n, err := ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 2, n)
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: first, Valid: true}, Ids: []uuid.UUID{duplicate},
	}))
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{first, duplicate})
	require.NoError(t, err)
	n, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 2, n, "both the retired and surviving logical runs must reconcile")
	for _, table := range []string{"rating_live_player_observations", "rating_live_guild_observations"} {
		var live int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE run_id=$1", duplicate).Scan(&live))
		require.Zero(t, live, "obsolete duplicate must not retain rating evidence")
	}
}
