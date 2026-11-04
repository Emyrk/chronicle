package servicerankings

import (
	"errors"
	"fmt"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRatingPolicyScanCheckpointAndScoreOnly(t *testing.T) {
	// Tenant hooks are process-global; follow the existing serial DB fixture pattern.
	previousPrepare, previousReset, previousNested := database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc
	database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc = servicetenant.PrepareConn, servicetenant.ResetConn, servicetenant.CheckNestedTx
	t.Cleanup(func() {
		database.PrepareConnFunc, database.ResetConnFunc, database.CheckNestedTxFunc = previousPrepare, previousReset, previousNested
	})
	ctx := testutil.Context(t, testutil.WaitLong)
	admin := servicetenant.AdminBypass(ctx)
	db, _ := dbtestutil.NewDB(t)
	tenant, realm := uuid.New(), uuid.New()
	_, err := db.InsertTenant(admin, database.InsertTenantParams{ID: tenant, Name: "Scan " + tenant.String(), Slug: pgtype.Text{String: "scan-" + tenant.String()[:8], Valid: true}, AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := db.InsertWoWServer(admin, database.InsertWoWServerParams{ID: uuid.New(), Name: "Scan server " + tenant.String()})
	require.NoError(t, err)
	require.NoError(t, db.SetServerTenant(admin, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	_, err = db.InsertWoWServerRealm(admin, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Scan realm " + tenant.String()})
	require.NoError(t, err)
	// No live observations or facts exist for these rows. The removed boss
	// must still be re-dirtied, and >100 subjects exercise a committed cursor.
	for i := 0; i < 105; i++ {
		_, err = db.Exec(admin, `INSERT INTO player_tenant_rating_boss_scores_evolving
            (tenant_id, realm_id, player_guid, instance_name, encounter_name, performance_metric, rating_metric, window_kind, score)
            VALUES ($1,$2,$3,'Removed raid','Removed boss','dps','renown','career',1)`, tenant, realm, fmt.Sprintf("player-%03d", i))
		require.NoError(t, err)
	}
	_, err = db.Exec(admin, `INSERT INTO player_tenant_rating_boss_scores_evolving
        (tenant_id, realm_id, player_guid, instance_name, encounter_name, performance_metric, rating_metric, window_kind, score)
        VALUES ($1,$2,'mastery-only','Removed raid','Removed boss','dps','mastery','all_time',1),
               ($1,$2,'peak-only','Removed raid','Removed boss','dps','peak','all_time',1)`, tenant, realm)
	require.NoError(t, err)
	_, err = db.Exec(admin, `INSERT INTO rating_peak_cohort_denominators_evolving
        (tenant_id, subject_kind, instance_name, encounter_name, difficulty_name, max_players, performance_metric, window_kind, rank_one_raw)
        VALUES ($1,'guild','Retired raid','Retired boss','heroic',40,'none','all_time',1)`, tenant)
	require.NoError(t, err)
	guild := uuid.New()
	_, err = db.Exec(admin, `INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,'Scan guild')`, guild, realm)
	require.NoError(t, err)
	_, err = db.Exec(admin, `INSERT INTO guild_tenant_rating_scope_scores_evolving
        (tenant_id,realm_id,guild_id,instance_name,rating_metric,window_kind,score)
        VALUES ($1,$2,$3,'Retired raid','peak','all_time',1)`, tenant, realm, guild)
	require.NoError(t, err)
	for i := 0; i < 105; i++ {
		_, err = db.Exec(admin, `INSERT INTO player_tenant_rating_scope_scores_evolving
            (tenant_id,realm_id,player_guid,instance_name,performance_metric,rating_metric,window_kind,score)
            VALUES ($1,$2,$3,'Orphan raid','dps','peak','all_time',1)`, tenant, realm, fmt.Sprintf("orphan-%03d", i))
		require.NoError(t, err)
	}
	_, err = db.Exec(admin, `INSERT INTO player_tenant_rating_scope_scores_evolving
        (tenant_id,realm_id,player_guid,instance_name,performance_metric,rating_metric,window_kind,score)
        VALUES ($1,$2,'peak-only','Removed raid','dps','peak','all_time',1)`, tenant, realm)
	require.NoError(t, err)
	require.NoError(t, db.ResetRatingPolicyScan(admin, tenant))
	// First page ends empty runs stage; second marks 100 renown keys.
	for i := 0; i < 2; i++ {
		done, err := ScanRatingPolicyPage(admin, db, tenant)
		require.NoError(t, err)
		require.False(t, done)
	}
	progress, err := db.LockRatingPolicyScanProgress(admin, tenant)
	require.NoError(t, err)
	require.Equal(t, "renown", progress.Stage)
	require.NotEmpty(t, progress.AfterKey)
	var count int
	require.NoError(t, db.QueryRow(admin, `SELECT count(*) FROM rating_dirty_renown_subjects WHERE tenant_id=$1`, tenant).Scan(&count))
	require.Equal(t, 100, count)
	// A new worker resumes the same committed cursor, then visits all stages.
	for i := 0; i < 20; i++ {
		done, err := ScanRatingPolicyPage(admin, db, tenant)
		require.NoError(t, err)
		if done {
			break
		}
	}
	done, err := ScanRatingPolicyPage(admin, db, tenant)
	require.NoError(t, err)
	require.True(t, done)
	for _, tc := range []struct {
		table string
		want  int
	}{
		{"rating_dirty_renown_subjects", 105}, {"rating_dirty_mastery_subjects", 1}, {"rating_dirty_peak_cohorts", 2},
	} {
		require.NoError(t, db.QueryRow(admin, "SELECT count(*) FROM "+tc.table+" WHERE tenant_id=$1", tenant).Scan(&count))
		require.Equal(t, tc.want, count, tc.table)
	}
	for _, tc := range []struct {
		query string
		want  int
	}{
		{`SELECT count(*) FROM player_tenant_rating_scope_scores_evolving WHERE tenant_id=$1`, 1},
		{`SELECT count(*) FROM guild_tenant_rating_scope_scores_evolving WHERE tenant_id=$1`, 0},
	} {
		require.NoError(t, db.QueryRow(admin, tc.query, tenant).Scan(&count))
		require.Equal(t, tc.want, count)
	}
	// A failed page must roll back its dirty insert and cursor together.
	rollback := errors.New("injected rollback")
	err = db.InTx(admin, func(tx database.Store) error {
		_, err := tx.MarkPolicyScanRenownPage(admin, database.MarkPolicyScanRenownPageParams{TenantID: tenant})
		if err != nil {
			return err
		}
		return rollback
	}, nil)
	require.ErrorIs(t, err, rollback)
	require.NoError(t, db.QueryRow(admin, `SELECT count(*) FROM rating_dirty_renown_subjects WHERE tenant_id=$1`, tenant).Scan(&count))
	require.Equal(t, 105, count)
	// Operator can request a new policy revision without a generation swap.
	require.NoError(t, db.ResetRatingPolicyScan(admin, tenant))
	progress, err = db.LockRatingPolicyScanProgress(admin, tenant)
	require.NoError(t, err)
	require.Equal(t, "runs", progress.Stage)
	require.Empty(t, progress.AfterKey)
}
