package database_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestHubSummaryTenantRealmsAndNoGeneration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant, other := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{tenant, other} {
		_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: id, Name: "Hub tenant " + id.String(), Slug: pgtype.Text{String: "hub-" + id.String()[:8], Valid: true}, AvailableFormats: []string{}})
		require.NoError(t, err)
	}
	for _, id := range []uuid.UUID{tenant, other} {
		server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Hub server " + id.String()})
		require.NoError(t, err)
		require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: id, Valid: true}}))
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Hub realm " + id.String()})
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id',$1,false)", tenant.String())
	require.NoError(t, err)
	realms, err := q.HubSummaryRealms(ctx, tenant)
	require.NoError(t, err)
	require.Len(t, realms, 1)
	require.Equal(t, "Hub realm "+tenant.String(), realms[0].Name)
	instances, err := q.HubSummaryInstances(ctx, tenant)
	require.NoError(t, err)
	require.Empty(t, instances)
	_, err = q.GetActiveTenantRatingGeneration(ctx, tenant)
	require.True(t, errors.Is(err, pgx.ErrNoRows))
	// The query must not wildcard the generation when the caller has none.
	rows, err := q.HubSummaryRatingRows(ctx, database.HubSummaryRatingRowsParams{TenantID: tenant, GenerationID: uuid.Nil, InstanceName: "Molten Core", WindowKind: "period", RenownWindow: "period", BossDepth: 1, PerformanceMetric: "dps"})
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestHubSummaryRatingPreviewLimitsAndRealm(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant, other := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{tenant, other} {
		_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: id, Name: "Hub score " + id.String(), Slug: pgtype.Text{String: "hub-score-" + id.String()[:8], Valid: true}, AvailableFormats: []string{}})
		require.NoError(t, err)
	}
	realms := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	for i, realm := range realms {
		owner := tenant
		if i == 2 {
			owner = other
		}
		server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Hub scoring server " + realm.String()})
		require.NoError(t, err)
		require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: owner, Valid: true}}))
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Hub scoring realm " + realm.String()})
		require.NoError(t, err)
	}
	gen := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO rating_score_generations(id,tenant_id,policy_version,as_of,status) VALUES($1,$2,1,$3,'active')", gen, tenant, time.Now())
	require.NoError(t, err)
	for i := 0; i < 8; i++ {
		for _, boss := range []string{"Ragnaros", "Lucifron"} {
			realm := realms[0]
			if i == 7 {
				realm = realms[1]
			}
			_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,rating_metric,window_kind,window_start,window_end,score) VALUES($1,$2,$3,$4,'Molten Core',$5,'',0,'Mage','Fire','','dps','peak','period',$6,$7,$8)`, gen, tenant, realm, fmt.Sprintf("player-%d", i), boss, time.Now().Add(-time.Hour), time.Now(), float64(100-i))
			require.NoError(t, err)
		}
	}
	for i := 0; i < 8; i++ {
		guildID := uuid.New()
		_, err = conn.Exec(ctx, "INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,$3)", guildID, realms[0], fmt.Sprintf("Hub guild %d", i))
		require.NoError(t, err)
		for _, boss := range []string{"Ragnaros", "Lucifron"} {
			for _, metric := range []string{"peak", "ranked_mastery"} {
				_, err = conn.Exec(ctx, `INSERT INTO guild_tenant_rating_boss_scores(generation_id,tenant_id,realm_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,rating_metric,window_kind,window_start,window_end,score) VALUES($1,$2,$3,$4,'Molten Core',$5,'',0,$6,'period',$7,$8,$9)`, gen, tenant, realms[0], guildID, boss, metric, time.Now().Add(-time.Hour), time.Now(), float64(100-i))
				require.NoError(t, err)
			}
		}
		for _, metric := range []string{"peak", "ranked_mastery"} {
			_, err = conn.Exec(ctx, `INSERT INTO guild_tenant_rating_scope_scores(generation_id,tenant_id,realm_id,guild_id,instance_name,difficulty_name,max_players,rating_metric,window_kind,window_start,window_end,score) VALUES($1,$2,$3,$4,'Molten Core','',0,$5,'period',$6,$7,$8)`, gen, tenant, realms[0], guildID, metric, time.Now().Add(-time.Hour), time.Now(), float64(100-i))
			require.NoError(t, err)
		}
	}
	// The same player can have several class/spec rows. All-class previews keep
	// only their best score per realm before applying the five-row cap.
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,rating_metric,window_kind,window_start,window_end,score) VALUES($1,$2,$3,'player-0','Molten Core','Ragnaros','',0,'Warrior','Fury','','dps','peak','period',$4,$5,150)`, gen, tenant, realms[0], time.Now().Add(-time.Hour), time.Now())
	require.NoError(t, err)
	// This foreign tenant's realm deliberately carries a row with the requested tenant ID;
	// the reader's server ownership join must reject it even with RLS bypassed.
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores(generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,rating_metric,window_kind,window_start,window_end,score) VALUES($1,$2,$3,'intruder','Molten Core','Ragnaros','',0,'Mage','Fire','','dps','peak','period',$4,$5,999)`, gen, tenant, realms[2], time.Now().Add(-time.Hour), time.Now())
	require.NoError(t, err)
	// Landing rows are keyed to the published cohort and remain fenced even
	// when the connection deliberately bypasses tenant RLS.
	_, err = conn.Exec(ctx, `INSERT INTO rankings_instance_summaries(instance_name,difficulty_name,max_players,tenant_id)
		VALUES ('Molten Core','',0,$1), ('Other raid','',0,$2)`, tenant, other)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_scope_scores(generation_id,tenant_id,realm_id,player_guid,instance_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,rating_metric,window_kind,window_start,window_end,score)
		VALUES ($1,$2,$3,'local','Molten Core','',0,'Mage','Fire','','dps','peak','period',$4,$5,101),
		($1,$2,$6,'foreign-realm','Molten Core','',0,'Mage','Fire','','dps','peak','period',$4,$5,999)`, gen, tenant, realms[0], time.Now().Add(-time.Hour), time.Now(), realms[2])
	require.NoError(t, err)
	landing, err := q.HubLandingRatingRows(ctx, database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: gen})
	require.NoError(t, err)
	require.Len(t, landing, 1)
	require.Equal(t, "local", landing[0].SubjectID)
	for i := 0; i < 4; i++ {
		_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_scope_scores(generation_id,tenant_id,realm_id,player_guid,instance_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,rating_metric,window_kind,window_start,window_end,score)
			VALUES ($1,$2,$3,$4,'Molten Core','',0,'Mage','Fire','','dps','peak','period',$5,$6,$7)`, gen, tenant, realms[0], fmt.Sprintf("extra-%d", i), time.Now().Add(-time.Hour), time.Now(), float64(100-i))
		require.NoError(t, err)
	}
	landing, err = q.HubLandingRatingRows(ctx, database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: gen})
	require.NoError(t, err)
	require.Len(t, landing, 3)
	require.Equal(t, "local", landing[0].SubjectID)
	landing, err = q.HubLandingRatingRows(ctx, database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: gen, RealmIds: []uuid.UUID{realms[1]}})
	require.NoError(t, err)
	require.Empty(t, landing)
	landing, err = q.HubLandingRatingRows(ctx, database.HubLandingRatingRowsParams{TenantID: tenant, GenerationID: uuid.Nil})
	require.NoError(t, err)
	require.Empty(t, landing)
	owner := uuid.New()
	_, err = q.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "hub-" + owner.String()[:8]})
	require.NoError(t, err)
	logGroup := uuid.New()
	_, err = q.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: logGroup, Owner: owner, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(time.Now()), UpdatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	require.NoError(t, q.InsertParsedLogGroup(ctx, logGroup))
	for i := 0; i < 6; i++ {
		realm := realms[0]
		if i == 5 {
			realm = realms[2]
		}
		guildID, instanceID := uuid.New(), uuid.New()
		_, err = conn.Exec(ctx, `INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,$3)`, guildID, realm, fmt.Sprintf("Speedrun guild %d", i))
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players) VALUES($1,$2,$3,'Molten Core','',0)`, instanceID, realm, logGroup)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `INSERT INTO instance_speedruns(instance_id,instance_name,realm_id,guild_id,qualified,start_time,completion_time,duration_ms,proof) VALUES($1,'Molten Core',$2,$3,true,$4,$5,$6,'{}')`, instanceID, realm, guildID, time.Now().Add(-time.Hour), time.Now(), int64(i+1))
		require.NoError(t, err)
	}
	runs, err := q.HubLandingSpeedruns(ctx, database.HubLandingSpeedrunsParams{TenantID: tenant})
	require.NoError(t, err)
	require.Len(t, runs, 3)
	require.Equal(t, "Speedrun guild 0", runs[0].GuildName)
	runs, err = q.HubLandingSpeedruns(ctx, database.HubLandingSpeedrunsParams{TenantID: tenant, RealmIds: []uuid.UUID{realms[1]}})
	require.NoError(t, err)
	require.Empty(t, runs)
	args := database.HubSummaryRatingRowsParams{TenantID: tenant, GenerationID: gen, InstanceName: "Molten Core", WindowKind: "period", RenownWindow: "period", BossDepth: 1, FeaturedEncounter: "Ragnaros", ExactCohort: true, DifficultyName: "", MaxPlayers: 0, PerformanceMetric: "dps"}
	rows, err := q.HubSummaryRatingRows(ctx, args)
	require.NoError(t, err)
	counts := map[string]int{}
	for _, row := range rows {
		if row.Subject == "player" && row.Board == "boss" && row.RatingMetric == "peak" {
			counts[row.EncounterName]++
			require.NotEqual(t, realms[2], row.RealmID)
		}
	}
	for _, row := range rows {
		if row.Board == "boss" && row.EncounterName == "Ragnaros" && row.SubjectID == "player-0" {
			require.Equal(t, 150.0, row.Score)
		}
	}
	require.Equal(t, 6, counts["Ragnaros"])
	require.Equal(t, 1, counts["Lucifron"])
	guildCounts := map[string]int{}
	for _, row := range rows {
		if row.Subject == "guild" {
			guildCounts[row.Board+":"+row.EncounterName+":"+row.RatingMetric]++
		}
	}
	for _, metric := range []string{"peak", "ranked_mastery"} {
		require.Equal(t, 6, guildCounts["scope::"+metric])
		require.Equal(t, 6, guildCounts["boss:Ragnaros:"+metric])
		require.Equal(t, 1, guildCounts["boss:Lucifron:"+metric])
	}
	args.RealmIds = []uuid.UUID{realms[1]}
	rows, err = q.HubSummaryRatingRows(ctx, args)
	require.NoError(t, err)
	for _, row := range rows {
		require.Equal(t, realms[1], row.RealmID)
	}
	args.ExactCohort = false
	rows, err = q.HubSummaryRatingRows(ctx, args)
	require.NoError(t, err)
	require.Empty(t, rows)
}
