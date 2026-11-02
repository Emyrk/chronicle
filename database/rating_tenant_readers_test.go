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

func TestTenantRatingReaders(t *testing.T) {
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
		_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: id, Name: "Reader test " + id.String(), Slug: pgtype.Text{String: "read-" + id.String()[:8], Valid: true}, AvailableFormats: []string{}})
		require.NoError(t, err)
	}
	realms := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	guilds := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for i, realm := range realms {
		owner := tenant
		if i == 2 {
			owner = other
		}
		server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Reader server " + realm.String()})
		require.NoError(t, err)
		require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: owner, Valid: true}}))
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Reader realm " + realm.String()})
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,$3)", guilds[i], realm, "Reader guild")
		require.NoError(t, err)
	}
	active, building := uuid.New(), uuid.New()
	for _, gen := range []uuid.UUID{active, building} {
		_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of) VALUES ($1,$2,1,$3)", gen, tenant, time.Now())
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, "UPDATE rating_score_generations SET status='active' WHERE id=$1", active)
	require.NoError(t, err)
	// A deliberately inconsistent realm exercises the explicit realm-owner join,
	// which must protect bypassed sessions as well as tenant RLS sessions.
	for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores", "guild_tenant_rating_boss_scores", "guild_tenant_rating_scope_scores"} {
		for i, gen := range []uuid.UUID{active, active, active, building} {
			realmIndex := i
			if i == 3 {
				realmIndex = 0
			}
			columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score"
			values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',$4)"
			args := []any{gen, tenant, realms[realmIndex], float64(100 - i*10)}
			if table == "player_tenant_rating_boss_scores" || table == "guild_tenant_rating_boss_scores" {
				columns += ",encounter_name"
				values = values[:len(values)-1] + ",'Ragnaros')"
			}
			if table == "player_tenant_rating_boss_scores" || table == "player_tenant_rating_scope_scores" {
				columns += ",player_guid,player_class,player_spec,player_sub_spec,performance_metric"
				values = values[:len(values)-1] + ",'player','Mage','Fire','Deep Fire','dps')"
			} else {
				columns += ",guild_id"
				values = values[:len(values)-1] + ",$5)"
				args = append(args, guilds[realmIndex])
			}
			_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, args...)
			require.NoError(t, err)
		}
	}
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", tenant.String())
	require.NoError(t, err)
	playerBoss := database.ListActivePlayerTenantBossScoresParams{TenantID: tenant, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Heroic", MaxPlayers: 40, PlayerClass: "Mage", PlayerSpec: "Fire", PlayerSubSpec: "Deep Fire", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", LimitCount: 100}
	playerScope := database.ListActivePlayerTenantScopeScoresParams{TenantID: tenant, InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, PlayerClass: "Mage", PlayerSpec: "Fire", PlayerSubSpec: "Deep Fire", PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", LimitCount: 100}
	guildBoss := database.ListActiveGuildTenantBossScoresParams{TenantID: tenant, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Heroic", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "all_time", LimitCount: 100}
	guildScope := database.ListActiveGuildTenantScopeScoresParams{TenantID: tenant, InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "all_time", LimitCount: 100}
	read := func() ([][]uuid.UUID, error) {
		pb, err := q.ListActivePlayerTenantBossScores(ctx, playerBoss)
		if err != nil {
			return nil, err
		}
		ps, err := q.ListActivePlayerTenantScopeScores(ctx, playerScope)
		if err != nil {
			return nil, err
		}
		gb, err := q.ListActiveGuildTenantBossScores(ctx, guildBoss)
		if err != nil {
			return nil, err
		}
		gs, err := q.ListActiveGuildTenantScopeScores(ctx, guildScope)
		if err != nil {
			return nil, err
		}
		result := make([][]uuid.UUID, 4)
		for _, row := range pb {
			result[0] = append(result[0], row.RealmID)
		}
		for _, row := range ps {
			result[1] = append(result[1], row.RealmID)
		}
		for _, row := range gb {
			result[2] = append(result[2], row.RealmID)
		}
		for _, row := range gs {
			result[3] = append(result[3], row.RealmID)
		}
		return result, nil
	}
	check := func(want []uuid.UUID) {
		t.Helper()
		got, err := read()
		require.NoError(t, err)
		for _, rows := range got {
			require.Equal(t, want, rows)
		}
	}
	check(realms[:2]) // nil realm filter means all tenant realms, sorted by score.
	playerBoss.RealmIds = []uuid.UUID{realms[1], realms[2]}
	playerScope.RealmIds = playerBoss.RealmIds
	guildBoss.RealmIds = playerBoss.RealmIds
	guildScope.RealmIds = playerBoss.RealmIds
	check(realms[1:2]) // cannot request another tenant's realm.
	playerBoss.RealmIds, playerScope.RealmIds, guildBoss.RealmIds, guildScope.RealmIds = nil, nil, nil, nil
	playerBoss.LimitCount, playerScope.LimitCount, guildBoss.LimitCount, guildScope.LimitCount = 1, 1, 1, 1
	check(realms[:1])
	playerBoss.LimitCount, playerScope.LimitCount, guildBoss.LimitCount, guildScope.LimitCount = 100, 100, 100, 100
	playerBoss.PlayerSubSpec = "Arcane"
	playerScope.PlayerSubSpec = "Arcane"
	pb, err := q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Empty(t, pb)
	ps, err := q.ListActivePlayerTenantScopeScores(ctx, playerScope)
	require.NoError(t, err)
	require.Empty(t, ps)
	guildBoss.EncounterName = "Onyxia"
	gb, err := q.ListActiveGuildTenantBossScores(ctx, guildBoss)
	require.NoError(t, err)
	require.Empty(t, gb)
	guildScope.DifficultyName = "Normal"
	gs, err := q.ListActiveGuildTenantScopeScores(ctx, guildScope)
	require.NoError(t, err)
	require.Empty(t, gs)
	playerBoss.PlayerSubSpec, playerScope.PlayerSubSpec, guildBoss.EncounterName, guildScope.DifficultyName = "Deep Fire", "Deep Fire", "Ragnaros", "Heroic"

	// Every cohort dimension is exact, not an implicit wildcard or a fallback.
	for _, change := range []func(*database.ListActivePlayerTenantBossScoresParams){
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.InstanceName = "Onyxia's Lair" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.EncounterName = "Onyxia" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.DifficultyName = "Normal" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.MaxPlayers = 20 },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.PlayerClass = "Warlock" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.PlayerSpec = "Frost" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.PlayerSubSpec = "Arcane" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.PerformanceMetric = "hps" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.RatingMetric = "mastery" },
		func(p *database.ListActivePlayerTenantBossScoresParams) { p.WindowKind = "career" },
	} {
		args := playerBoss
		change(&args)
		rows, err := q.ListActivePlayerTenantBossScores(ctx, args)
		require.NoError(t, err)
		require.Empty(t, rows)
	}
	for _, change := range []func(*database.ListActivePlayerTenantScopeScoresParams){
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.InstanceName = "Onyxia's Lair" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.DifficultyName = "Normal" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.MaxPlayers = 20 },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.PlayerClass = "Warlock" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.PlayerSpec = "Frost" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.PlayerSubSpec = "Arcane" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.PerformanceMetric = "hps" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.RatingMetric = "mastery" },
		func(p *database.ListActivePlayerTenantScopeScoresParams) { p.WindowKind = "career" },
	} {
		args := playerScope
		change(&args)
		rows, err := q.ListActivePlayerTenantScopeScores(ctx, args)
		require.NoError(t, err)
		require.Empty(t, rows)
	}
	for _, change := range []func(*database.ListActiveGuildTenantBossScoresParams){
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.InstanceName = "Onyxia's Lair" },
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.EncounterName = "Onyxia" },
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.DifficultyName = "Normal" },
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.MaxPlayers = 20 },
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.RatingMetric = "mastery" },
		func(p *database.ListActiveGuildTenantBossScoresParams) { p.WindowKind = "career" },
	} {
		args := guildBoss
		change(&args)
		rows, err := q.ListActiveGuildTenantBossScores(ctx, args)
		require.NoError(t, err)
		require.Empty(t, rows)
	}
	for _, change := range []func(*database.ListActiveGuildTenantScopeScoresParams){
		func(p *database.ListActiveGuildTenantScopeScoresParams) { p.InstanceName = "Onyxia's Lair" },
		func(p *database.ListActiveGuildTenantScopeScoresParams) { p.DifficultyName = "Normal" },
		func(p *database.ListActiveGuildTenantScopeScoresParams) { p.MaxPlayers = 20 },
		func(p *database.ListActiveGuildTenantScopeScoresParams) { p.RatingMetric = "mastery" },
		func(p *database.ListActiveGuildTenantScopeScoresParams) { p.WindowKind = "career" },
	} {
		args := guildScope
		change(&args)
		rows, err := q.ListActiveGuildTenantScopeScores(ctx, args)
		require.NoError(t, err)
		require.Empty(t, rows)
	}
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", other.String())
	require.NoError(t, err)
	check(nil) // explicit tenant argument cannot bypass tenant RLS.
}
