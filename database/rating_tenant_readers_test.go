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
	// A player's strongest class/spec wins before pagination. A lower-scoring
	// second cohort must not reappear on later pages, including across ties.
	for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores"} {
		columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,player_guid,player_class,player_spec,player_sub_spec,performance_metric"
		for _, row := range []struct {
			guid, class, spec string
			score             float64
		}{{"player", "Warrior", "Arms", 105}, {"other", "Rogue", "Combat", 105}} {
			values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',$4,$5,$6,$7,'','dps')"
			if table == "player_tenant_rating_boss_scores" {
				columns += ",encounter_name"
				values = values[:len(values)-1] + ",'Ragnaros')"
			}
			_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[0], row.score, row.guid, row.class, row.spec)
			require.NoError(t, err)
			if table == "player_tenant_rating_boss_scores" {
				columns = columns[:len(columns)-len(",encounter_name")]
			}
		}
	}
	for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores"} {
		columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,player_guid,player_class,player_spec,player_sub_spec,performance_metric"
		values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',95,'classmate','Warrior','Fury','','dps')"
		if table == "player_tenant_rating_boss_scores" {
			columns += ",encounter_name"
			values = values[:len(values)-1] + ",'Ragnaros')"
		}
		_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[0])
		require.NoError(t, err)
	}
	allBoss := database.ListActiveAllClassPlayerTenantBossScoresParams{TenantID: tenant, GenerationID: active, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Heroic", MaxPlayers: 40, PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", LimitCount: 1}
	allScope := database.ListActiveAllClassPlayerTenantScopeScoresParams{TenantID: tenant, GenerationID: active, InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, PerformanceMetric: "dps", RatingMetric: "peak", WindowKind: "all_time", LimitCount: 1}
	for page, want := range []string{"other", "player", "classmate", "player"} {
		bossRows, e := q.ListActiveAllClassPlayerTenantBossScores(ctx, allBoss)
		require.NoError(t, e)
		require.Len(t, bossRows, 1, "boss page %d", page)
		scopeRows, e := q.ListActiveAllClassPlayerTenantScopeScores(ctx, allScope)
		require.NoError(t, e)
		require.Len(t, scopeRows, 1, "scope page %d", page)
		require.Equal(t, want, bossRows[0].PlayerGuid)
		require.Equal(t, want, scopeRows[0].PlayerGuid)
		wantRealm := realms[0]
		if page == 3 {
			wantRealm = realms[1]
		}
		require.Equal(t, wantRealm, bossRows[0].RealmID)
		require.Equal(t, bossRows[0].RealmID, scopeRows[0].RealmID)
		allBoss.AfterScore, allBoss.AfterRealmID, allBoss.AfterPlayerGuid = bossRows[0].Score, bossRows[0].RealmID, bossRows[0].PlayerGuid
		allScope.AfterScore, allScope.AfterRealmID, allScope.AfterPlayerGuid = scopeRows[0].Score, scopeRows[0].RealmID, scopeRows[0].PlayerGuid
	}
	bossEnd, e := q.ListActiveAllClassPlayerTenantBossScores(ctx, allBoss)
	require.NoError(t, e)
	require.Empty(t, bossEnd)
	scopeEnd, e := q.ListActiveAllClassPlayerTenantScopeScores(ctx, allScope)
	require.NoError(t, e)
	require.Empty(t, scopeEnd)
	allBoss.AfterRealmID, allScope.AfterRealmID = uuid.Nil, uuid.Nil
	allBoss.AfterPlayerGuid, allScope.AfterPlayerGuid = "", ""
	allBoss.PlayerClass, allScope.PlayerClass = "Mage", "Mage"
	mageBoss, e := q.ListActiveAllClassPlayerTenantBossScores(ctx, allBoss)
	require.NoError(t, e)
	require.Equal(t, "player", mageBoss[0].PlayerGuid)
	require.Equal(t, float64(100), mageBoss[0].Score)
	mageScope, e := q.ListActiveAllClassPlayerTenantScopeScores(ctx, allScope)
	require.NoError(t, e)
	require.Equal(t, float64(100), mageScope[0].Score)
	allBoss.PlayerClass, allScope.PlayerClass = "Warrior", "Warrior"
	allBoss.LimitCount, allScope.LimitCount = 100, 100
	warriorBoss, e := q.ListActiveAllClassPlayerTenantBossScores(ctx, allBoss)
	require.NoError(t, e)
	require.Len(t, warriorBoss, 2)
	require.Equal(t, "Arms", warriorBoss[0].PlayerSpec)
	require.Equal(t, "Fury", warriorBoss[1].PlayerSpec)
	warriorScope, e := q.ListActiveAllClassPlayerTenantScopeScores(ctx, allScope)
	require.NoError(t, e)
	require.Len(t, warriorScope, 2)
	require.Equal(t, "Fury", warriorScope[1].PlayerSpec)
	allBoss.PlayerClass, allScope.PlayerClass = "", ""
	// The same score and realm require the subject tie-break. Page through
	// all four boards with a single-row limit, including the lower score.
	for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores"} {
		boss := table == "player_tenant_rating_boss_scores"
		columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,player_guid,player_class,player_spec,player_sub_spec,performance_metric"
		values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',100,'zzz','Mage','Fire','Deep Fire','dps')"
		if boss {
			columns += ",encounter_name"
			values = values[:len(values)-1] + ",'Ragnaros')"
		}
		_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[0])
		require.NoError(t, err)
	}
	lastGuild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,'Reader tie guild')", lastGuild, realms[0])
	require.NoError(t, err)
	for _, table := range []string{"guild_tenant_rating_boss_scores", "guild_tenant_rating_scope_scores"} {
		columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,guild_id"
		values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',100,$4)"
		if table == "guild_tenant_rating_boss_scores" {
			columns += ",encounter_name"
			values = values[:len(values)-1] + ",'Ragnaros')"
		}
		_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[0], lastGuild)
		require.NoError(t, err)
	}
	generation, err := q.GetActiveTenantRatingGeneration(ctx, tenant)
	require.NoError(t, err)
	require.Equal(t, active, generation)
	playerBoss.LimitCount, playerScope.LimitCount, guildBoss.LimitCount, guildScope.LimitCount = 1, 1, 1, 1
	seen := [4][]string{}
	for page := 0; page < 3; page++ {
		pb, err := q.ListActivePlayerTenantBossScores(ctx, playerBoss)
		require.NoError(t, err)
		ps, err := q.ListActivePlayerTenantScopeScores(ctx, playerScope)
		require.NoError(t, err)
		gb, err := q.ListActiveGuildTenantBossScores(ctx, guildBoss)
		require.NoError(t, err)
		gs, err := q.ListActiveGuildTenantScopeScores(ctx, guildScope)
		require.NoError(t, err)
		for i, length := range []int{len(pb), len(ps), len(gb), len(gs)} {
			require.Equal(t, 1, length, "board %d page %d", i, page)
		}
		for i, row := range []struct {
			generation, realm uuid.UUID
			score             float64
			subject           string
		}{
			{pb[0].GenerationID, pb[0].RealmID, pb[0].Score, pb[0].PlayerGuid},
			{ps[0].GenerationID, ps[0].RealmID, ps[0].Score, ps[0].PlayerGuid},
			{gb[0].GenerationID, gb[0].RealmID, gb[0].Score, gb[0].GuildID.String()},
			{gs[0].GenerationID, gs[0].RealmID, gs[0].Score, gs[0].GuildID.String()},
		} {
			require.Equal(t, active, row.generation)
			seen[i] = append(seen[i], row.subject)
		}
		playerBoss.GenerationID, playerScope.GenerationID, guildBoss.GenerationID, guildScope.GenerationID = active, active, active, active
		playerBoss.AfterScore, playerScope.AfterScore = pb[0].Score, ps[0].Score
		guildBoss.AfterScore, guildScope.AfterScore = gb[0].Score, gs[0].Score
		playerBoss.AfterRealmID, playerScope.AfterRealmID = pb[0].RealmID, ps[0].RealmID
		guildBoss.AfterRealmID, guildScope.AfterRealmID = gb[0].RealmID, gs[0].RealmID
		playerBoss.AfterPlayerGuid, playerScope.AfterPlayerGuid = pb[0].PlayerGuid, ps[0].PlayerGuid
		guildBoss.AfterGuildID, guildScope.AfterGuildID = gb[0].GuildID, gs[0].GuildID
	}
	require.Equal(t, []string{"player", "zzz", "player"}, seen[0])
	require.Equal(t, seen[0], seen[1])
	wantGuilds := []string{guilds[0].String(), lastGuild.String()}
	if wantGuilds[0] > wantGuilds[1] {
		wantGuilds[0], wantGuilds[1] = wantGuilds[1], wantGuilds[0]
	}
	for _, board := range seen[2:] {
		require.Equal(t, append(append([]string{}, wantGuilds...), guilds[1].String()), board)
	}
	pb, err := q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Empty(t, pb)
	ps, err := q.ListActivePlayerTenantScopeScores(ctx, playerScope)
	require.NoError(t, err)
	require.Empty(t, ps)
	gb, err := q.ListActiveGuildTenantBossScores(ctx, guildBoss)
	require.NoError(t, err)
	require.Empty(t, gb)
	gs, err := q.ListActiveGuildTenantScopeScores(ctx, guildScope)
	require.NoError(t, err)
	require.Empty(t, gs)
	// A position without a pinned generation cannot walk another snapshot.
	playerBoss.GenerationID = uuid.Nil
	pb, err = q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Empty(t, pb)
	playerBoss.GenerationID = active
	playerBoss.PlayerSubSpec = "Arcane"
	playerScope.PlayerSubSpec = "Arcane"
	pb, err = q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Empty(t, pb)
	ps, err = q.ListActivePlayerTenantScopeScores(ctx, playerScope)
	require.NoError(t, err)
	require.Empty(t, ps)
	guildBoss.EncounterName = "Onyxia"
	gb, err = q.ListActiveGuildTenantBossScores(ctx, guildBoss)
	require.NoError(t, err)
	require.Empty(t, gb)
	guildScope.DifficultyName = "Normal"
	gs, err = q.ListActiveGuildTenantScopeScores(ctx, guildScope)
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
	// Names are additive: the same character GUID in two realms must resolve
	// independently, and a missing character must not remove a score row.
	const guid = "0x00000000000000AB"
	for i, name := range []string{"Realm one player", "Realm two player"} {
		_, err = conn.Exec(ctx, `INSERT INTO game_players (id,realm_id,guild_id,name,class,gender,race)
			VALUES ($1,$2,$3,$4,'MAGE','Male','Orc')`, guid, realms[i], guilds[i], name)
		require.NoError(t, err)
		for _, table := range []string{"player_tenant_rating_boss_scores", "player_tenant_rating_scope_scores"} {
			columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,player_guid,player_class,player_spec,player_sub_spec,performance_metric"
			values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',$4,$5,'Mage','Fire','Deep Fire','dps')"
			if table == "player_tenant_rating_boss_scores" {
				columns += ",encounter_name"
				values = values[:len(values)-1] + ",'Ragnaros')"
			}
			_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[i], float64(88-i), guid)
			require.NoError(t, err)
		}
	}
	playerBoss.LimitCount, playerScope.LimitCount = 100, 100
	guildBoss.LimitCount, guildScope.LimitCount = 100, 100
	playerBoss.AfterRealmID, playerScope.AfterRealmID = uuid.Nil, uuid.Nil
	playerBoss.AfterScore, playerScope.AfterScore = 0, 0
	playerBoss.AfterPlayerGuid, playerScope.AfterPlayerGuid = "", ""
	guildBoss.AfterRealmID, guildScope.AfterRealmID = uuid.Nil, uuid.Nil
	guildBoss.AfterScore, guildScope.AfterScore = 0, 0
	guildBoss.AfterGuildID, guildScope.AfterGuildID = uuid.Nil, uuid.Nil
	pb, err = q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	ps, err = q.ListActivePlayerTenantScopeScores(ctx, playerScope)
	require.NoError(t, err)
	found := make(map[uuid.UUID]string)
	for _, row := range pb {
		require.NotEmpty(t, row.RealmName)
		if row.PlayerGuid == "player" || row.PlayerGuid == "zzz" {
			require.False(t, row.PlayerName.Valid)
			continue
		}
		require.Equal(t, guid, row.PlayerGuid)
		require.True(t, row.PlayerName.Valid)
		require.True(t, row.GuildName.Valid)
		found[row.RealmID] = row.PlayerName.String
	}
	require.Equal(t, map[uuid.UUID]string{realms[0]: "Realm one player", realms[1]: "Realm two player"}, found)
	for _, row := range ps {
		require.NotEmpty(t, row.RealmName)
		if row.PlayerGuid == guid {
			require.True(t, row.PlayerName.Valid)
			require.True(t, row.GuildName.Valid)
		} else {
			require.False(t, row.PlayerName.Valid)
		}
	}
	// A guild ID from another realm must not supply a display name.
	for _, table := range []string{"guild_tenant_rating_boss_scores", "guild_tenant_rating_scope_scores"} {
		columns := "generation_id,tenant_id,realm_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,score,guild_id"
		values := "($1,$2,$3,'Molten Core','Heroic',40,'peak','all_time',77,$4)"
		if table == "guild_tenant_rating_boss_scores" {
			columns += ",encounter_name"
			values = values[:len(values)-1] + ",'Ragnaros')"
		}
		_, err = conn.Exec(ctx, "INSERT INTO "+table+" ("+columns+") VALUES "+values, active, tenant, realms[0], guilds[1])
		require.NoError(t, err)
	}
	gb, err = q.ListActiveGuildTenantBossScores(ctx, guildBoss)
	require.NoError(t, err)
	gs, err = q.ListActiveGuildTenantScopeScores(ctx, guildScope)
	require.NoError(t, err)
	for _, row := range gb {
		require.NotEmpty(t, row.RealmName)
		require.Equal(t, row.RealmID == realms[1] || row.GuildID != guilds[1], row.GuildName.Valid)
	}
	for _, row := range gs {
		require.NotEmpty(t, row.RealmName)
		require.Equal(t, row.RealmID == realms[1] || row.GuildID != guilds[1], row.GuildName.Valid)
	}
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", other.String())
	require.NoError(t, err)
	check(nil) // explicit tenant argument cannot bypass tenant RLS.

	// A publication invalidates a cursor rather than silently mixing the new
	// generation into its traversal. Retired snapshots are subject to deletion.
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", tenant.String())
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	require.NoError(t, q.RetireActiveRatingScoreGeneration(ctx, tenant))
	activated, err := q.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{GenerationID: building, TenantID: tenant})
	require.NoError(t, err)
	require.EqualValues(t, 1, activated)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	current, err := q.GetActiveTenantRatingGeneration(ctx, tenant)
	require.NoError(t, err)
	require.Equal(t, building, current)
	require.NotEqual(t, playerBoss.GenerationID, current) // API must report stale cursor.
	playerBoss.PlayerSubSpec, playerScope.PlayerSubSpec, guildBoss.EncounterName, guildScope.DifficultyName = "Deep Fire", "Deep Fire", "Ragnaros", "Heroic"
	pb, err = q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Empty(t, pb)
	ps, err = q.ListActivePlayerTenantScopeScores(ctx, playerScope)
	require.NoError(t, err)
	require.Empty(t, ps)
	gb, err = q.ListActiveGuildTenantBossScores(ctx, guildBoss)
	require.NoError(t, err)
	require.Empty(t, gb)
	gs, err = q.ListActiveGuildTenantScopeScores(ctx, guildScope)
	require.NoError(t, err)
	require.Empty(t, gs)
	playerBoss.GenerationID = uuid.Nil
	playerBoss.AfterRealmID = uuid.Nil
	pb, err = q.ListActivePlayerTenantBossScores(ctx, playerBoss)
	require.NoError(t, err)
	require.Len(t, pb, 1)
	require.Equal(t, building, pb[0].GenerationID)
}
