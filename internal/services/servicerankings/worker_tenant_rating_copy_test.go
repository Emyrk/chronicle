package servicerankings

import (
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestCopyTenantRatingPageResumeAndDirtyIntent(t *testing.T) {
	// Pool hooks are process-wide; keep this test serial while installing them.
	previousPrepare, previousReset, previousNested := database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc
	database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc = servicetenant.PrepareConn, servicetenant.ResetConn, servicetenant.CheckNestedTx
	t.Cleanup(func() {
		database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc = previousPrepare, previousReset, previousNested
	})
	ctx := testutil.Context(t, testutil.WaitLong)
	admin := servicetenant.AdminBypass(ctx)
	db, _ := dbtestutil.NewDB(t)
	tenant, realm, gen, guild := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	err := db.InTx(admin, func(tx database.Store) error {
		_, err := tx.InsertTenant(admin, database.InsertTenantParams{ID: tenant, Name: "Copy " + tenant.String(), Slug: pgtype.Text{String: "copy-" + tenant.String()[:8], Valid: true}, AvailableFormats: []string{}})
		if err != nil {
			return err
		}
		server, err := tx.InsertWoWServer(admin, database.InsertWoWServerParams{ID: uuid.New(), Name: "Copy server " + tenant.String()})
		if err != nil {
			return err
		}
		if err := tx.SetServerTenant(admin, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}); err != nil {
			return err
		}
		if _, err := tx.InsertWoWServerRealm(admin, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Copy realm " + tenant.String()}); err != nil {
			return err
		}
		if _, err := tx.Exec(admin, "INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,'Copier guild')", guild, realm); err != nil {
			return err
		}
		if _, err := tx.Exec(admin, "INSERT INTO rating_score_generations(id,tenant_id,policy_version,as_of,status) VALUES($1,$2,1,$3,'active')", gen, tenant, time.Now()); err != nil {
			return err
		}
		// 201 rows force a committed cursor and a second copy transaction.
		for i := 0; i < 201; i++ {
			if _, err := tx.Exec(admin, `INSERT INTO player_tenant_rating_boss_scores
              (generation_id,tenant_id,realm_id,player_guid,instance_name,encounter_name,performance_metric,rating_metric,window_kind,score,best_raw)
              VALUES($1,$2,$3,$4,'Molten Core','Ragnaros','dps','peak','all_time',42,100)`, gen, tenant, realm, fmt.Sprintf("player-%03d", i)); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(admin, `INSERT INTO player_tenant_rating_scope_scores (generation_id,tenant_id,realm_id,player_guid,performance_metric,rating_metric,window_kind,score) VALUES ($1,$2,$3,'player-000','dps','peak','all_time',12)`, gen, tenant, realm); err != nil {
			return err
		}
		if _, err := tx.Exec(admin, `INSERT INTO rating_peak_cohort_denominators (generation_id,tenant_id,subject_kind,instance_name,encounter_name,difficulty_name,max_players,performance_metric,window_kind,rank_one_raw) VALUES ($1,$2,'player','Molten Core','Ragnaros','',0,'dps','all_time',100)`, gen, tenant); err != nil {
			return err
		}
		if _, err := tx.Exec(admin, `INSERT INTO guild_tenant_rating_boss_scores (generation_id,tenant_id,realm_id,guild_id,instance_name,encounter_name,rating_metric,window_kind,score)
			VALUES ($1,$2,$3,$4,'Molten Core','Ragnaros','renown','career',25)`, gen, tenant, realm, guild); err != nil {
			return err
		}
		if _, err := tx.Exec(admin, `INSERT INTO guild_tenant_rating_scope_scores (generation_id,tenant_id,realm_id,guild_id,rating_metric,window_kind,score)
			VALUES ($1,$2,$3,$4,'renown','career',25)`, gen, tenant, realm, guild); err != nil {
			return err
		}
		return nil
	}, nil)
	require.NoError(t, err)

	done, err := CopyTenantRatingPage(ctx, db, tenant)
	require.NoError(t, err)
	require.False(t, done)
	state, err := db.GetTenantRatingReadState(servicetenant.WithTenantID(ctx, tenant), tenant)
	require.NoError(t, err)
	require.Equal(t, "copying", state)
	// Simulate a newer evolving writer and its durable dirty key. Copy must not
	// overwrite the writer's row or acknowledge the key.
	err = db.InTx(admin, func(tx database.Store) error {
		if _, err := tx.Exec(admin, `UPDATE player_tenant_rating_boss_scores_evolving SET score=777 WHERE tenant_id=$1 AND player_guid='player-000'`, tenant); err != nil {
			return err
		}
		_, err := tx.Exec(admin, `INSERT INTO rating_dirty_renown_subjects (tenant_id,subject_kind,realm_id,subject_id,instance_name,encounter_name) VALUES ($1,'player',$2,'player-000','Molten Core','Ragnaros')`, tenant, realm)
		return err
	}, nil)
	require.NoError(t, err)
	// Restart with the persisted cursor and finish all five stages.
	for i := 0; i < 12; i++ {
		done, err = CopyTenantRatingPage(ctx, db, tenant)
		require.NoError(t, err)
		if done {
			break
		}
	}
	require.True(t, done)
	state, err = db.GetTenantRatingReadState(servicetenant.WithTenantID(ctx, tenant), tenant)
	require.NoError(t, err)
	require.Equal(t, "evolving", state)
	err = db.InTx(admin, func(tx database.Store) error {
		var count int
		var changed float64
		var dirty int
		var scope int
		var guildBoss int
		var guildScope int
		var peak int
		for _, v := range []struct {
			query  string
			target any
		}{
			{`SELECT count(*) FROM player_tenant_rating_boss_scores_evolving WHERE tenant_id=$1`, &count},
			{`SELECT score FROM player_tenant_rating_boss_scores_evolving WHERE tenant_id=$1 AND player_guid='player-000'`, &changed},
			{`SELECT count(*) FROM rating_dirty_renown_subjects WHERE tenant_id=$1`, &dirty},
			{`SELECT count(*) FROM player_tenant_rating_scope_scores_evolving WHERE tenant_id=$1`, &scope},
			{`SELECT count(*) FROM guild_tenant_rating_boss_scores_evolving WHERE tenant_id=$1`, &guildBoss},
			{`SELECT count(*) FROM guild_tenant_rating_scope_scores_evolving WHERE tenant_id=$1`, &guildScope},
			{`SELECT count(*) FROM rating_peak_cohort_denominators_evolving WHERE tenant_id=$1`, &peak},
		} {
			if err := tx.QueryRow(admin, v.query, tenant).Scan(v.target); err != nil {
				return err
			}
		}
		require.Equal(t, 201, count)
		require.Equal(t, float64(777), changed)
		require.Equal(t, 1, dirty)
		require.Equal(t, 1, scope)
		require.Equal(t, 1, guildBoss)
		require.Equal(t, 1, guildScope)
		require.Equal(t, 1, peak)
		return nil
	}, nil)
	require.NoError(t, err)
}
