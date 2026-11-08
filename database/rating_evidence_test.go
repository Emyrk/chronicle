package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInstanceRatingEvidenceResolvesCanonicalDuplicateRun(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupParsesTest(t)
	ctx := servicetenant.AdminBypass(testutil.Context(t, testutil.WaitLong))
	store = canonicalTenantStore{store}
	tenantID := uuid.New()
	anchorID := uuid.New()
	duplicateID := uuid.New()
	start := time.Date(2026, 11, 8, 12, 0, 0, 0, time.UTC)

	_, err := pool.Exec(ctx, `INSERT INTO tenants(id,name) VALUES($1,'Rating evidence tenant')`, tenantID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE wow_servers SET tenant_id=$1 WHERE id=(SELECT server_id FROM wow_server_realms WHERE id=$2)`, tenantID, realmID)
	require.NoError(t, err)
	insertRankingRunSource(t, pool, store, realmID, anchorID, start, "Ragnaros")
	insertRankingRunSource(t, pool, store, realmID, duplicateID, start.Add(time.Minute), "Ragnaros")
	_, err = pool.Exec(ctx, `UPDATE log_instances SET duplicate_group_id=$1 WHERE id IN ($1,$2)`, anchorID, duplicateID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE encounter_dps_rankings SET player_spec='Frost' WHERE instance_id IN ($1,$2)`, anchorID, duplicateID)
	require.NoError(t, err)

	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{anchorID, duplicateID})
	require.NoError(t, err)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, `SET app.tenant_id = '`+tenantID.String()+`'`)
	require.NoError(t, err)
	queries := database.NewQueries(conn)

	run, err := queries.GetInstanceRatingEvidenceRun(ctx, database.GetInstanceRatingEvidenceRunParams{
		TenantID: tenantID, InstanceID: duplicateID,
	})
	require.NoError(t, err)
	assert.Equal(t, anchorID, run.RunID)
	require.True(t, run.RepresentativeInstanceID.Valid)
	assert.Equal(t, anchorID, run.RepresentativeInstanceID.UUID)

	observations, err := queries.ListInstanceRatingPlayerObservations(ctx, database.ListInstanceRatingPlayerObservationsParams{
		TenantID: tenantID, RunID: run.RunID,
	})
	require.NoError(t, err)
	require.Len(t, observations, 1)
	assert.Equal(t, anchorID, observations[0].SourceInstanceID)
	assert.Equal(t, "Player", observations[0].PlayerName)
	assert.Equal(t, "dps", observations[0].Metric)

	renown, err := queries.ListInstanceRatingPlayerRenownFacts(ctx, database.ListInstanceRatingPlayerRenownFactsParams{
		TenantID: tenantID, RunID: run.RunID,
	})
	require.NoError(t, err)
	require.Len(t, renown, 1)
	assert.Equal(t, anchorID, renown[0].SourceInstanceID)
}
