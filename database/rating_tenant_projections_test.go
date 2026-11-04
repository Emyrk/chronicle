package database_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTenantRatingProjectionsIsolationAndCrossRealm(t *testing.T) {
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
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: "Projection Tenant", Slug: pgtype.Text{String: "proj-" + uuid.NewString()[:8], Valid: true}, AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Tenant projection test"})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	realms := []uuid.UUID{uuid.New(), uuid.New()}
	guilds := []uuid.UUID{uuid.New(), uuid.New()}
	for i, realm := range realms {
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: []string{"First", "Second"}[i]})
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", guilds[i], realm, []string{"First Guild", "Second Guild"}[i])
		require.NoError(t, err)
	}
	generation := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id, tenant_id, policy_version, as_of) VALUES ($1,$2,1,$3)", generation, tenant, time.Now())
	require.NoError(t, err)
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		table    string
		identity string
		values   []any
		boss     bool
		player   bool
	}{
		{"player_tenant_rating_boss_scores", "player_guid", []any{"same-guid", "same-guid"}, true, true},
		{"player_tenant_rating_scope_scores", "player_guid", []any{"same-guid", "same-guid"}, false, true},
		{"guild_tenant_rating_boss_scores", "guild_id", []any{guilds[0], guilds[1]}, true, false},
		{"guild_tenant_rating_scope_scores", "guild_id", []any{guilds[0], guilds[1]}, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.table, func(t *testing.T) {
			// Identifiers here are fixed test literals, not external input.
			columns := "generation_id,tenant_id,realm_id," + tc.identity + ",instance_name,rating_metric,window_kind,score"
			values := "($1,$2,$3,$4,'Molten Core','peak','all_time',100)"
			if tc.boss {
				columns += ",encounter_name"
				values = "($1,$2,$3,$4,'Molten Core','peak','all_time',100,'Ragnaros')"
			}
			if tc.player {
				columns += ",performance_metric"
				values = values[:len(values)-1] + ",'dps')"
			}
			insert := "INSERT INTO " + tc.table + " (" + columns + ") VALUES " + values
			for i := range realms {
				_, err := conn.Exec(ctx, insert, generation, tenant, realms[i], tc.values[i])
				require.NoError(t, err, "same tenant must accept scores from both realms")
			}
			_, err := conn.Exec(ctx, insert, generation, other, realms[0], tc.values[0])
			require.Error(t, err, "generation must belong to the score tenant")
			_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
			require.NoError(t, err)
			_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", tenant.String())
			require.NoError(t, err)
			var count int
			require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM "+tc.table).Scan(&count))
			require.Equal(t, 2, count)
			_, err = conn.Exec(ctx, insert, generation, other, realms[0], tc.values[0])
			require.Error(t, err, "another tenant cannot write through a visible realm")
			_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", other.String())
			require.NoError(t, err)
			require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM "+tc.table).Scan(&count))
			require.Zero(t, count, "another tenant cannot read scores even when its generation ID is known")
			_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
			require.NoError(t, err)
		})
	}
	// Window bounds are part of the projection contract, including scope totals.
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_scope_scores
        (generation_id,tenant_id,realm_id,player_guid,rating_metric,performance_metric,window_kind,window_start,window_end,score)
        VALUES ($1,$2,$3,'period-player','peak','dps','period',$4,$4,1)`, generation, tenant, realms[0], start)
	require.Error(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_scope_scores
        (generation_id,tenant_id,realm_id,player_guid,rating_metric,performance_metric,window_kind,window_start,window_end,score)
        VALUES ($1,$2,$3,'period-player','peak','dps','period',$4,$5,1)`, generation, tenant, realms[0], start, start.Add(time.Hour))
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "DELETE FROM rating_score_generations WHERE id=$1", generation)
	require.NoError(t, err)
	for _, tc := range cases {
		var count int
		require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM "+tc.table).Scan(&count))
		require.Zero(t, count, "generation deletion cascades projection rows")
	}
}

func TestTenantRatingProjectionsDownAndUp(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	// The app pool assumes the chronicle RLS role after migrating. DDL must
	// execute as the migration owner, not as the application role.
	_, err = conn.Exec(ctx, "RESET ROLE")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "SET ROLE chronicle") }()
	// The Peak denominator has a foreign key to the generation/tenant index
	// created by 000317; roll it back first, then restore it after 000317.
	for _, migration := range []string{
		"000325_rating_peak_denominators.down", "000317_tenant_rating_projections.down",
		"000317_tenant_rating_projections.up", "000325_rating_peak_denominators.up",
	} {
		sql, err := os.ReadFile("migrations/" + migration + ".sql")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, string(sql))
		require.NoError(t, err, "migration %s", migration)
	}
}
