package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// Tied Peaks (every spec's #1 is 100) rank the higher DPS first, across pages.
func TestTenantPeakTieBreaksByThroughput(t *testing.T) {
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

	tenant, realm, gen := uuid.New(), uuid.New(), uuid.New()
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: "Tie test " + tenant.String(), Slug: pgtype.Text{String: "tie-" + tenant.String()[:8], Valid: true}, AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Tie server " + realm.String()})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Tie realm " + realm.String()})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of,status) VALUES ($1,$2,1,$3,'active')", gen, tenant, time.Now())
	require.NoError(t, err)

	// Same score; "a" sorts first by GUID but has the lower DPS, "c" has none (0).
	rows := []struct {
		guid, class, spec string
		raw               any
	}{{"a", "Mage", "Fire", 900.0}, {"b", "Warrior", "Fury", 1300.0}, {"c", "Rogue", "Combat", 0.0}}
	for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores"} {
		for _, row := range rows {
			columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,player_guid,player_class,player_spec,player_sub_spec,performance_metric,best_raw"
			values := "($1,$2,$3,'Molten Core','',0,'peak','period',100,$4,$5,$6,'','dps',$7"
			if table == "player_tenant_rating_boss_scores" {
				columns += ",encounter_name"
				values += ",'Ragnaros'"
			}
			_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+",window_start,window_end) VALUES "+values+",now() - interval '1 day',now())", gen, tenant, realm, row.guid, row.class, row.spec, row.raw)
			require.NoError(t, err)
		}
	}

	boss := database.ListActiveAllClassPlayerTenantBossScoresParams{TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core", EncounterName: "Ragnaros", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period", LimitCount: 1}
	scope := database.ListActiveAllClassPlayerTenantScopeScoresParams{TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "period", LimitCount: 1}
	key := func(raw pgtype.Float8) float64 {
		if !raw.Valid {
			return 0
		}
		return raw.Float64
	}
	for page, want := range []string{"b", "a", "c"} {
		b, err := q.ListActiveAllClassPlayerTenantBossScores(ctx, boss)
		require.NoError(t, err)
		require.Len(t, b, 1, "boss page %d", page)
		require.Equal(t, want, b[0].PlayerGuid, "boss page %d", page)
		s, err := q.ListActiveAllClassPlayerTenantScopeScores(ctx, scope)
		require.NoError(t, err)
		require.Len(t, s, 1, "scope page %d", page)
		require.Equal(t, want, s[0].PlayerGuid, "scope page %d", page)
		boss.AfterScore, boss.AfterRaw, boss.AfterRealmID, boss.AfterPlayerGuid = b[0].Score, key(b[0].BestRaw), b[0].RealmID, b[0].PlayerGuid
		scope.AfterScore, scope.AfterRaw, scope.AfterRealmID, scope.AfterPlayerGuid = s[0].Score, s[0].BestRaw, s[0].RealmID, s[0].PlayerGuid
	}
	b, err := q.ListActiveAllClassPlayerTenantBossScores(ctx, boss)
	require.NoError(t, err)
	require.Empty(t, b)

	// The hub summary ranks the same way and reports each Peak's throughput.
	hub, err := q.HubSummaryRatingRows(ctx, database.HubSummaryRatingRowsParams{TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core", FeaturedEncounter: "Ragnaros", ExactCohort: true, PerformanceMetric: "dps"})
	require.NoError(t, err)
	var scopeOrder []string
	for _, row := range hub {
		if row.Subject == "player" && row.Board == "scope" && row.RatingMetric == "peak" {
			scopeOrder = append(scopeOrder, row.SubjectID)
			if row.SubjectID == "b" {
				require.Equal(t, 1300.0, row.PeakRaw)
			}
		}
	}
	require.Equal(t, []string{"b", "a", "c"}, scopeOrder)
}
