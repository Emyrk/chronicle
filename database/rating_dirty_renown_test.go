package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRenownFactDirtySubjectsUseRealmTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	tenant := uuid.New()
	_, err = q.InsertTenant(ctx, database.InsertTenantParams{ID: tenant, Name: uuid.NewString(), AvailableFormats: []string{}})
	require.NoError(t, err)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: uuid.NewString()})
	require.NoError(t, err)
	require.NoError(t, q.SetServerTenant(ctx, database.SetServerTenantParams{ID: server.ID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}))
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenant.String())
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'false'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO renown_kill_facts
		(realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,'player',$2,'Raid','Boss',$3)`, realm, uuid.New(), time.Now().UTC())
	require.NoError(t, err)
	var markedTenant uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, `SELECT tenant_id FROM rating_dirty_renown_subjects
		WHERE realm_id=$1 AND subject_kind='player'`, realm).Scan(&markedTenant))
	require.Equal(t, tenant, markedTenant)
}

func TestRenownFactChangesMarkBothOldAndNewSubjects(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: uuid.NewString()})
	require.NoError(t, err)
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	guild, err := q.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: uuid.NewString(), CreatedAt: database.Timestamptz(time.Now())})
	require.NoError(t, err)
	run := uuid.New()
	killed := time.Date(2026, 10, 31, 0, 0, 0, 0, time.UTC)
	var playerFact uuid.UUID
	err = pool.QueryRow(ctx, `INSERT INTO renown_kill_facts
		(realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,'old-player',$2,'Raid','Old Boss',$3) RETURNING id`, realm, run, killed).Scan(&playerFact)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE renown_kill_facts SET player_guid='new-player', encounter_name='New Boss' WHERE id=$1`, playerFact)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `DELETE FROM renown_kill_facts WHERE id=$1`, playerFact)
	require.NoError(t, err)

	var oldRevision, newRevision int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT revision FROM rating_dirty_renown_subjects
		WHERE realm_id=$1 AND subject_kind='player' AND subject_id='old-player' AND encounter_name='Old Boss'`, realm).Scan(&oldRevision))
	require.NoError(t, pool.QueryRow(ctx, `SELECT revision FROM rating_dirty_renown_subjects
		WHERE realm_id=$1 AND subject_kind='player' AND subject_id='new-player' AND encounter_name='New Boss'`, realm).Scan(&newRevision))
	require.Equal(t, int64(2), oldRevision)
	require.Equal(t, int64(2), newRevision)

	guildRun := uuid.New()
	var guildFact uuid.UUID
	err = pool.QueryRow(ctx, `INSERT INTO guild_renown_kill_facts
		(tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,$2,$3,$4,'Raid','Guild Boss',$5) RETURNING id`, uuid.Nil, realm, guild.ID, guildRun, killed).Scan(&guildFact)
	require.NoError(t, err)
	var guildRevision int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT revision FROM rating_dirty_renown_subjects
		WHERE realm_id=$1 AND subject_kind='guild' AND subject_id=$2 AND encounter_name='Guild Boss'`, realm, guild.ID.String()).Scan(&guildRevision))
	require.Equal(t, int64(1), guildRevision)

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `DELETE FROM guild_renown_kill_facts WHERE id=$1`, guildFact)
	require.NoError(t, err)
	require.NoError(t, tx.Rollback(ctx))
	require.NoError(t, pool.QueryRow(ctx, `SELECT revision FROM rating_dirty_renown_subjects
		WHERE realm_id=$1 AND subject_kind='guild' AND subject_id=$2 AND encounter_name='Guild Boss'`, realm, guild.ID.String()).Scan(&guildRevision))
	require.Equal(t, int64(1), guildRevision, "rolled-back source changes cannot enqueue dirty work")
}
