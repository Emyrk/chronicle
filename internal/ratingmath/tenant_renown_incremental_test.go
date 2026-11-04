package ratingmath

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func setupActiveRenownProjection(t *testing.T, ctx context.Context, pool *pgxpool.Pool, q database.Store, now time.Time) (uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: uuid.NewString()})
	require.NoError(t, err)
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	guild, err := q.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: uuid.NewString(), CreatedAt: database.Timestamptz(now)})
	require.NoError(t, err)
	generation, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(now), SourceCutoff: database.Timestamptz(now),
	})
	require.NoError(t, err)
	manifest, err := json.Marshal(map[string]any{
		"writer": "tenant", "rules_version": 2,
		"tenant_policy": TenantRatingPolicy{TenantID: uuid.Nil, Version: 2, PeriodDays: 180,
			BestWeight: .35, FormWeight: .50, FloorWeight: .15, RankOneWeight: .5, FullRankKills: 5},
		"renown_bosses": []map[string]any{{"realm_id": realm, "instance_name": "Raid", "encounter_name": "Boss", "renown_points": 7}},
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET manifest=$2, phase='ready' WHERE generation_id=$1", generation, manifest)
	require.NoError(t, err)
	published, err := q.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, err)
	require.True(t, published)
	return realm, guild.ID, generation
}

func TestRefreshDirtyTenantRenownDefersDuringFullRebuild(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, _, _ := setupActiveRenownProjection(t, ctx, pool, q, now)
	building, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(now.Add(time.Minute)),
		SourceCutoff: database.Timestamptz(now),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO renown_kill_facts
		(realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,'player',$2,'Raid','Boss',$3)`, realm, uuid.New(), now.Add(-time.Hour))
	require.NoError(t, err)
	processed, err := RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Zero(t, processed)
	var dirty int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_renown_subjects WHERE realm_id=$1", realm).Scan(&dirty))
	require.Equal(t, 1, dirty)
	_, err = q.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: uuid.Nil, GenerationID: building})
	require.NoError(t, err)
	processed, err = RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
}

func TestRefreshDirtyTenantRenownFromFacts(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, guild, generation := setupActiveRenownProjection(t, ctx, pool, q, now)
	insert := func(killed time.Time) uuid.UUID {
		t.Helper()
		run := uuid.New()
		_, err := pool.Exec(ctx, `INSERT INTO renown_kill_facts (realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
			VALUES ($1,'player',$2,'Raid','Boss',$3)`, realm, run, killed)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO guild_renown_kill_facts (tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
			VALUES ($1,$2,$3,$4,'Raid','Boss',$5)`, uuid.Nil, realm, guild, run, killed)
		require.NoError(t, err)
		return run
	}
	oldRun := insert(now.AddDate(0, 0, -181))
	newRun := insert(now.AddDate(0, 0, -1))
	processed, err := RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	assertRenown := func(table, idColumn string, id any, career, period float64) {
		t.Helper()
		for _, w := range []struct {
			name string
			want float64
		}{{"career", career}, {"period", period}} {
			var score float64
			err := pool.QueryRow(ctx, "SELECT score FROM "+table+" WHERE generation_id=$1 AND "+idColumn+"=$2 AND window_kind=$3 AND rating_metric='renown'", generation, id, w.name).Scan(&score)
			require.NoError(t, err)
			require.Equal(t, w.want, score)
		}
	}
	assertRenown("player_tenant_rating_boss_scores", "player_guid", "player", 14, 7)
	assertRenown("guild_tenant_rating_boss_scores", "guild_id", guild, 14, 7)
	for _, scope := range []struct {
		table, idColumn string
		id              any
	}{
		{"player_tenant_rating_scope_scores", "player_guid", "player"},
		{"guild_tenant_rating_scope_scores", "guild_id", guild},
	} {
		var scopes int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM "+scope.table+" WHERE generation_id=$1 AND "+scope.idColumn+"=$2 AND rating_metric='renown'", generation, scope.id).Scan(&scopes)
		require.NoError(t, err)
		require.Equal(t, 2, scopes, "one raid score for each window")
	}
	processed, err = RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Zero(t, processed, "retry is idempotent")

	_, err = pool.Exec(ctx, "DELETE FROM renown_kill_facts WHERE run_id=$1", newRun)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM guild_renown_kill_facts WHERE run_id=$1", newRun)
	require.NoError(t, err)
	processed, err = RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for _, score := range []struct {
		table, idColumn string
		id              any
	}{
		{"player_tenant_rating_boss_scores", "player_guid", "player"},
		{"guild_tenant_rating_boss_scores", "guild_id", guild},
	} {
		var career float64
		require.NoError(t, pool.QueryRow(ctx, "SELECT score FROM "+score.table+" WHERE generation_id=$1 AND "+score.idColumn+"=$2 AND window_kind='career' AND rating_metric='renown'", generation, score.id).Scan(&career))
		require.Equal(t, 7.0, career)
		var periodRows int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+score.table+" WHERE generation_id=$1 AND "+score.idColumn+"=$2 AND window_kind='period' AND rating_metric='renown'", generation, score.id).Scan(&periodRows))
		require.Zero(t, periodRows)
	}
	_ = oldRun
}

func TestRenownExpiryMarksOnlyExpiredPeriodSubjects(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, guild, generation := setupActiveRenownProjection(t, ctx, pool, q, now)
	killed := now.AddDate(0, 0, -179)
	run := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO renown_kill_facts (realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,'player',$2,'Raid','Boss',$3)`, realm, run, killed)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO guild_renown_kill_facts (tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,$2,$3,$4,'Raid','Boss',$5)`, uuid.Nil, realm, guild, run, killed)
	require.NoError(t, err)
	processed, err := RefreshDirtyTenantRenown(ctx, q, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	periodStart := database.Timestamptz(now.AddDate(0, 0, -180))
	players, err := q.ListPlayerRenownExpiryPage(ctx, database.ListPlayerRenownExpiryPageParams{TenantID: uuid.Nil, PeriodStart: periodStart, BatchSize: 200})
	require.NoError(t, err)
	require.Len(t, players, 0, "unchanged cutoff must not revisit current rows")
	advanced := now.AddDate(0, 0, 2)
	periodStart = database.Timestamptz(advanced.AddDate(0, 0, -180))
	players, err = q.ListPlayerRenownExpiryPage(ctx, database.ListPlayerRenownExpiryPageParams{TenantID: uuid.Nil, PeriodStart: periodStart, BatchSize: 200})
	require.NoError(t, err)
	require.Len(t, players, 1)
	require.True(t, players[0].Expired)
	guilds, err := q.ListGuildRenownExpiryPage(ctx, database.ListGuildRenownExpiryPageParams{TenantID: uuid.Nil, PeriodStart: periodStart, BatchSize: 200})
	require.NoError(t, err)
	require.Len(t, guilds, 1)
	require.True(t, guilds[0].Expired)
	require.NoError(t, q.MarkDirtyRenownSubject(ctx, database.MarkDirtyRenownSubjectParams{
		TenantID: uuid.Nil, SubjectKind: "player", RealmID: realm,
		SubjectID: "player", InstanceName: "Raid", EncounterName: "Boss",
	}))
	require.NoError(t, q.MarkDirtyRenownSubject(ctx, database.MarkDirtyRenownSubjectParams{
		TenantID: uuid.Nil, SubjectKind: "guild", RealmID: realm,
		SubjectID: guild.String(), InstanceName: "Raid", EncounterName: "Boss",
	}))
	processed, err = RefreshDirtyTenantRenown(ctx, q, uuid.Nil, advanced)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for _, item := range []struct {
		table, idColumn string
		id              any
	}{
		{"player_tenant_rating_boss_scores", "player_guid", "player"},
		{"guild_tenant_rating_boss_scores", "guild_id", guild},
	} {
		var career, period int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+item.table+" WHERE generation_id=$1 AND "+item.idColumn+"=$2 AND rating_metric='renown' AND window_kind='career'", generation, item.id).Scan(&career))
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+item.table+" WHERE generation_id=$1 AND "+item.idColumn+"=$2 AND rating_metric='renown' AND window_kind='period'", generation, item.id).Scan(&period))
		require.Equal(t, 1, career)
		require.Zero(t, period)
	}
}
