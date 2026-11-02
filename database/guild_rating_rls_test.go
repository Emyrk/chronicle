package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGuildRenownFactRLSRejectsForgedTenantOnVisibleRealm(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	guild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds(id,realm_id,name) VALUES ($1,$2,'RLS Guild')", guild, realm)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_id = ''")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_id") }()
	insert := `INSERT INTO guild_renown_kill_facts
		(tenant_id,realm_id,guild_id,run_id,instance_name,encounter_name,killed_at)
		VALUES ($1,$2,$3,$4,'Molten Core','Ragnaros',$5)`
	_, err = conn.Exec(ctx, insert, uuid.New(), realm, guild, uuid.New(), time.Now())
	require.Error(t, err, "a root-visible realm cannot be stamped with a forged tenant")
	_, err = conn.Exec(ctx, insert, uuid.Nil, realm, guild, uuid.New(), time.Now())
	require.NoError(t, err, "the same realm accepts its actual root tenant")
}
