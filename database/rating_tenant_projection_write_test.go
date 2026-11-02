package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTenantProjectionWrites(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	q := database.NewQueries(conn)
	tenant, other := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{tenant, other} {
		_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: id, Name: "Writer " + id.String(), Slug: pgtype.Text{String: "write-" + id.String()[:8], Valid: true}, AvailableFormats: []string{}})
		require.NoError(t, err)
	}
	realms := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	guilds := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for i, realm := range realms {
		owner := tenant
		if i == 2 {
			owner = other
		}
		server, e := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Writer server " + realm.String()})
		require.NoError(t, e)
		require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: owner, Valid: true}}))
		_, e = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Writer realm " + realm.String()})
		require.NoError(t, e)
		_, e = conn.Exec(ctx, "INSERT INTO guilds (id,realm_id,name) VALUES ($1,$2,$3)", guilds[i], realm, "Writer guild")
		require.NoError(t, e)
	}
	generation, retired, foreign := uuid.New(), uuid.New(), uuid.New()
	for _, v := range []struct {
		id, tenant uuid.UUID
		status     string
	}{{generation, tenant, "building"}, {retired, tenant, "retired"}, {foreign, other, "building"}} {
		_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of,status) VALUES ($1,$2,1,$3,$4)", v.id, v.tenant, time.Now(), v.status)
		require.NoError(t, err)
	}
	start := pgtype.Timestamptz{Time: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), Valid: true}
	end := pgtype.Timestamptz{Time: start.Time.Add(time.Hour), Valid: true}
	for _, tc := range []struct {
		name, table string
		write       func(uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, float64) (int64, error)
	}{
		{"player boss", "player_tenant_rating_boss_scores", func(g, owner, realm, _ uuid.UUID, score float64) (int64, error) {
			return q.InsertPlayerTenantBossScore(ctx, database.InsertPlayerTenantBossScoreParams{GenerationID: g, TenantID: owner, RealmID: realm, PlayerGuid: "player", InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Heroic", MaxPlayers: 40, PlayerClass: "Mage", PlayerSpec: "Fire", PlayerSubSpec: "Deep Fire", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period", WindowStart: start, WindowEnd: end, Score: score})
		}},
		{"player scope", "player_tenant_rating_scope_scores", func(g, owner, realm, _ uuid.UUID, score float64) (int64, error) {
			return q.InsertPlayerTenantScopeScore(ctx, database.InsertPlayerTenantScopeScoreParams{GenerationID: g, TenantID: owner, RealmID: realm, PlayerGuid: "player", InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, PlayerClass: "Mage", PlayerSpec: "Fire", PlayerSubSpec: "Deep Fire", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period", WindowStart: start, WindowEnd: end, Score: score})
		}},
		{"guild boss", "guild_tenant_rating_boss_scores", func(g, owner, realm, guild uuid.UUID, score float64) (int64, error) {
			return q.InsertGuildTenantBossScore(ctx, database.InsertGuildTenantBossScoreParams{GenerationID: g, TenantID: owner, RealmID: realm, GuildID: guild, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Heroic", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", WindowStart: start, WindowEnd: end, Score: score})
		}},
		{"guild scope", "guild_tenant_rating_scope_scores", func(g, owner, realm, guild uuid.UUID, score float64) (int64, error) {
			return q.InsertGuildTenantScopeScore(ctx, database.InsertGuildTenantScopeScoreParams{GenerationID: g, TenantID: owner, RealmID: realm, GuildID: guild, InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", WindowStart: start, WindowEnd: end, Score: score})
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			check := func(g, owner, realm, guild uuid.UUID, score float64, want int64) {
				t.Helper()
				rows, e := tc.write(g, owner, realm, guild, score)
				require.NoError(t, e)
				require.Equal(t, want, rows)
			}
			check(generation, tenant, realms[0], guilds[0], 10, 1)
			check(generation, tenant, realms[0], guilds[0], 99, 0) // immutable replay
			check(generation, tenant, realms[1], guilds[1], 20, 1)
			check(generation, tenant, realms[2], guilds[2], 30, 0) // realm belongs to another tenant
			check(generation, other, realms[2], guilds[2], 30, 0)  // generation belongs to first tenant
			check(foreign, tenant, realms[0], guilds[0], 30, 0)
			check(retired, tenant, realms[0], guilds[0], 30, 0)
			if tc.name == "guild boss" || tc.name == "guild scope" {
				check(generation, tenant, realms[0], guilds[1], 30, 0)
			}
			var count int
			var score float64
			require.NoError(t, conn.QueryRow(ctx, "SELECT count(*), min(score) FROM "+tc.table+" WHERE generation_id=$1 AND tenant_id=$2", generation, tenant).Scan(&count, &score))
			require.Equal(t, 2, count)
			require.Equal(t, 10.0, score)
		})
	}
	rows, err := q.InsertPlayerTenantScopeScore(ctx, database.InsertPlayerTenantScopeScoreParams{
		GenerationID: generation, TenantID: tenant, RealmID: realms[0], PlayerGuid: "",
		InstanceName: "Molten Core", PerformanceMetric: "dps", RatingMetric: "peak",
		WindowKind: "period", WindowStart: start, WindowEnd: end, Score: 1,
	})
	require.NoError(t, err)
	require.Zero(t, rows, "empty player evidence identity must not be projected")

	// The cohort dimensions are part of the key, not a lossy subject-only upsert.
	cohortRows, err := q.InsertPlayerTenantScopeScore(ctx, database.InsertPlayerTenantScopeScoreParams{
		GenerationID: generation, TenantID: tenant, RealmID: realms[0], PlayerGuid: "player",
		InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40,
		PlayerClass: "Mage", PlayerSpec: "Frost", PlayerSubSpec: "Deep Fire",
		PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period",
		WindowStart: start, WindowEnd: end, Score: 35,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), cohortRows)

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = database.NewQueries(conn).InsertPlayerTenantScopeScore(cancelled, database.InsertPlayerTenantScopeScoreParams{
		GenerationID: generation, TenantID: tenant, RealmID: realms[0], PlayerGuid: "cancelled",
		InstanceName: "Molten Core", PerformanceMetric: "dps", RatingMetric: "peak",
		WindowKind: "period", WindowStart: start, WindowEnd: end, Score: 1,
	})
	require.ErrorIs(t, err, context.Canceled)

	// Once published, neither a replay nor a new subject may write to the old generation.
	_, err = conn.Exec(ctx, "UPDATE rating_score_generations SET status='active' WHERE id=$1", generation)
	require.NoError(t, err)
	rows, err = q.InsertPlayerTenantScopeScore(ctx, database.InsertPlayerTenantScopeScoreParams{GenerationID: generation, TenantID: tenant, RealmID: realms[0], PlayerGuid: "new-player", InstanceName: "Molten Core", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period", WindowStart: start, WindowEnd: end, Score: 1})
	require.NoError(t, err)
	require.Zero(t, rows)
}
