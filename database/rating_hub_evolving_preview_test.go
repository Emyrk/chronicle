package database_test

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// The evolving boss preview resolves display names after ranking, preserving score cohort fields.
func TestEvolvingHubSummaryBossPreviewDisplay(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant, realm := uuid.New(), uuid.New()
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: "Evolving preview " + tenant.String(), AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Evolving preview"})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Evolving realm"})
	require.NoError(t, err)
	const known = "0x0000000000000042"
	_, err = conn.Exec(ctx, `INSERT INTO game_players (id,realm_id,name,class,gender,race)
 VALUES ($1,$2,'Known','WARLOCK','Male','Orc')`, known, realm)
	require.NoError(t, err)
	for _, row := range []struct {
		guid, metric, cls, perf string
		score                   float64
	}{
		{known, "peak", "Mage", "dps", 100},
		{known, "peak", "Warrior", "dps", 110}, // Best class/spec must win before the one-row board limit.
		{"0x0000000000000043", "peak", "Mage", "dps", 90},
		{known, "renown", "", "none", 10},
	} {
		_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores_evolving
   (tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
    performance_metric,rating_metric,window_kind,window_start,window_end,score)
   VALUES ($1,$2,$3,'Molten Core','Ragnaros','',0,$4,'','',$5,$6,'period',now()-interval '1 day',now(),$7)`, tenant, realm, row.guid, row.cls, row.perf, row.metric, row.score)
		require.NoError(t, err)
	}
	guildID := uuid.New()
	_, err = conn.Exec(ctx, `INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,'Test guild')`, guildID, realm)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO guild_tenant_rating_boss_scores_evolving
	 (tenant_id,realm_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,rating_metric,window_kind,window_start,window_end,score)
	 VALUES ($1,$2,$3,'Molten Core','Ragnaros','',0,'peak','period',now()-interval '1 day',now(),55)`, tenant, realm, guildID)
	require.NoError(t, err)
	// A boss represented only by guild scores must still appear in selected_bosses.
	_, err = conn.Exec(ctx, `INSERT INTO guild_tenant_rating_boss_scores_evolving
	 (tenant_id,realm_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,rating_metric,window_kind,window_start,window_end,score)
	 VALUES ($1,$2,$3,'Molten Core','Lucifron','',0,'peak','period',now()-interval '1 day',now(),66)`, tenant, realm, guildID)
	require.NoError(t, err)
	// A forged score with this tenant ID but a realm owned by another tenant
	// must not displace a valid leader, even when this fixture bypasses RLS.
	otherTenant, otherRealm := uuid.New(), uuid.New()
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: otherTenant, Name: "Evolving foreign " + otherTenant.String(), AvailableFormats: []string{}})
	require.NoError(t, err)
	otherServer, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Foreign preview " + otherRealm.String()})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: otherServer.ID, TenantID: uuid.NullUUID{UUID: otherTenant, Valid: true}}))
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: otherRealm, ServerID: otherServer.ID, Name: "Foreign realm " + otherRealm.String()})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO player_tenant_rating_boss_scores_evolving
	 (tenant_id,realm_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
	 performance_metric,rating_metric,window_kind,window_start,window_end,score)
	 VALUES ($1,$2,'foreign','Molten Core','Ragnaros','',0,'Mage','','','dps','peak','period',now()-interval '1 day',now(),999)`, tenant, otherRealm)
	require.NoError(t, err)
	args := database.EvolvingHubSummaryRatingRowsParams{TenantID: tenant, GenerationID: uuid.Nil, InstanceName: "Molten Core", FeaturedEncounter: "", DifficultyName: "", MaxPlayers: 0, ExactCohort: true, PerformanceMetric: "dps", WindowKind: "period", RenownWindow: "period", BossDepth: 1}
	rows, err := q.EvolvingHubSummaryRatingRows(ctx, args)
	require.NoError(t, err)
	guildBosses := map[string]bool{}
	for _, row := range rows {
		require.Equal(t, "boss", row.Board)
		if row.Subject == "guild" {
			guildBosses[row.EncounterName] = true
			require.Equal(t, guildID.String(), row.SubjectID)
			require.Equal(t, "Test guild", row.SubjectName)
			continue
		}
		require.Equal(t, known, row.SubjectID)
		require.Equal(t, "Known", row.SubjectName)
		if row.RatingMetric == "renown" {
			// The existing evolving boss board keeps Renown's empty class.
			require.Empty(t, row.PlayerClass)
		} else {
			require.Equal(t, "Warrior", row.PlayerClass)
			require.Equal(t, 110.0, row.Score)
		}
	}
	page, err := q.EvolvingHubSetBoardPage(ctx, database.EvolvingHubSetBoardPageParams{
		TenantID: tenant, GenerationID: uuid.Nil, InstanceName: "Molten Core", EncounterNames: []string{"Lucifron", "Ragnaros"},
		Subject: "player", RatingMetric: "peak", PerformanceMetric: "dps", WindowKind: "period", RenownWindow: "period", LimitCount: 10,
	})
	require.NoError(t, err)
	require.NotEmpty(t, page)
	require.Equal(t, known, page[0].SubjectID)
	require.Equal(t, "Warrior", page[0].PlayerClass)
	require.Equal(t, 55.0, page[0].Score)
	var components []struct {
		EncounterName string  `json:"encounter_name"`
		Score         float64 `json:"score"`
	}
	require.NoError(t, json.Unmarshal(page[0].PeakComponents, &components))
	require.Len(t, components, 2)
	require.Equal(t, "Lucifron", components[0].EncounterName)
	require.Zero(t, components[0].Score)
	require.Equal(t, "Ragnaros", components[1].EncounterName)
	require.Equal(t, 110.0, components[1].Score)
	// The handler's read-only wrapper must preserve the generated query result.
	store := database.New(pool)
	err = store.InTx(ctx, func(tx database.Store) error {
		_, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'")
		if err != nil {
			return err
		}
		wrapped, err := tx.EvolvingHubSummaryRatingRowsWithoutNestedLoops(ctx, args)
		require.NoError(t, err)
		require.Equal(t, rows, wrapped)
		return nil
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	require.NoError(t, err)
	require.Len(t, rows, 4)
	require.Equal(t, map[string]bool{"Lucifron": true, "Ragnaros": true}, guildBosses)
}
