package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type dirtyRankingRun struct {
	generation        int64
	lastTransactionID string
}

func readDirtyRankingRun(t *testing.T, pool *pgxpool.Pool, runID uuid.UUID) dirtyRankingRun {
	t.Helper()

	ctx := testutil.Context(t, testutil.WaitShort)
	var row dirtyRankingRun
	require.NoError(t, pool.QueryRow(ctx, `
    SELECT generation, last_transaction_id::text
    FROM ranking_run_summary_dirty
    WHERE run_id = $1
  `, runID).Scan(&row.generation, &row.lastTransactionID))
	return row
}

func insertDirtyTestRanking(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID, instanceID uuid.UUID) {
	t.Helper()

	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Lucifron",
		instanceName:  "Molten Core",
		playerGUID:    "P-DIRTY-" + instanceID.String()[:8],
		playerClass:   "MAGE",
		playerSpec:    "Frost",
		maxPlayers:    40,
		damageDone:    1000,
		durationSecs:  10,
		dps:           100,
		killedAt:      time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC),
		isBoss:        true,
		instanceID:    instanceID,
	})
}

func setRealmTenant(t *testing.T, pool *pgxpool.Pool, realmID uuid.UUID, tenantID uuid.UUID) {
	t.Helper()

	ctx := testutil.Context(t, testutil.WaitShort)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO tenants (id, slug, name)
		VALUES ($1, $2, $3)
	`, tenantID, "tenant-"+tenantID.String()[:8], "Tenant "+tenantID.String()[:8])
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		UPDATE wow_servers ws
		SET tenant_id = $1
		FROM wow_server_realms wsr
		WHERE wsr.server_id = ws.id
		  AND wsr.id = $2
	`, tenantID, realmID)
	require.NoError(t, err)
}

func TestRankingRunDirtyTracksServerTenantReassignment(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	firstTenantID := uuid.New()
	setRealmTenant(t, pool, realmID, firstTenantID)

	instanceID := uuid.New()
	insertDirtyTestRanking(t, pool, store, realmID, instanceID)

	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = $1", instanceID)
	require.NoError(t, err)

	secondTenantID := uuid.New()
	setRealmTenant(t, pool, realmID, secondTenantID)

	reassigned := readDirtyRankingRun(t, pool, instanceID)
	assert.Equal(t, int64(1), reassigned.generation)
	assert.NotEmpty(t, reassigned.lastTransactionID)
}

func TestRankingRunDirtyGenerationCoalescesWithinTransaction(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	instanceID := uuid.New()
	insertDirtyTestRanking(t, pool, store, realmID, instanceID)

	inserted := readDirtyRankingRun(t, pool, instanceID)
	assert.Equal(t, int64(1), inserted.generation)
	assert.NotEmpty(t, inserted.lastTransactionID)

	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = $1", instanceID)
	require.NoError(t, err)

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `
    UPDATE encounter_dps_rankings
    SET damage_done = damage_done + 1
    WHERE instance_id = $1
  `, instanceID)
	require.NoError(t, err)

	var firstTupleID string
	require.NoError(t, tx.QueryRow(ctx, `
		SELECT ctid::text FROM ranking_run_summary_dirty WHERE run_id = $1
	`, instanceID).Scan(&firstTupleID))

	_, err = tx.Exec(ctx, `
    UPDATE encounter_dps_rankings
    SET dps = dps + 1
    WHERE instance_id = $1
  `, instanceID)
	require.NoError(t, err)

	var secondTupleID string
	require.NoError(t, tx.QueryRow(ctx, `
		SELECT ctid::text FROM ranking_run_summary_dirty WHERE run_id = $1
	`, instanceID).Scan(&secondTupleID))
	assert.Equal(t, firstTupleID, secondTupleID, "same-transaction invalidation should not rewrite the dirty row")

	require.NoError(t, tx.Commit(ctx))

	first := readDirtyRankingRun(t, pool, instanceID)
	assert.Equal(t, int64(1), first.generation)
	assert.NotEmpty(t, first.lastTransactionID)

	_, err = pool.Exec(ctx, `
    UPDATE encounter_dps_rankings
    SET damage_done = damage_done + 1
    WHERE instance_id = $1
  `, instanceID)
	require.NoError(t, err)

	second := readDirtyRankingRun(t, pool, instanceID)
	assert.Equal(t, int64(2), second.generation)
	assert.NotEqual(t, first.lastTransactionID, second.lastTransactionID)
}

func TestRankingRunDirtyTracksDirectRankingMutationAndInstanceDeletion(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	instanceID := uuid.New()
	insertDirtyTestRanking(t, pool, store, realmID, instanceID)

	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = $1", instanceID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM encounter_dps_rankings WHERE instance_id = $1", instanceID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), readDirtyRankingRun(t, pool, instanceID).generation)

	_, err = pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = $1", instanceID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM log_instances WHERE id = $1", instanceID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), readDirtyRankingRun(t, pool, instanceID).generation)
}

func TestRankingRunDirtyTracksAncestorCascadeDeletion(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	instanceID := uuid.New()
	insertDirtyTestRanking(t, pool, store, realmID, instanceID)

	ctx := testutil.Context(t, testutil.WaitShort)
	var logGroupID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT log_group_id FROM log_instances WHERE id = $1
	`, instanceID).Scan(&logGroupID))
	_, err := pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = $1", instanceID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM parsed_log_group WHERE id = $1", logGroupID)
	require.NoError(t, err)

	// The ancestor cascade, parent BEFORE DELETE trigger, and ranking-row deletes
	// execute in one transaction, so they coalesce into one durable generation.
	assert.Equal(t, int64(1), readDirtyRankingRun(t, pool, instanceID).generation)

	var instanceCount, rankingCount int64
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM log_instances WHERE id = $1
	`, instanceID).Scan(&instanceCount))
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM encounter_dps_rankings WHERE instance_id = $1
	`, instanceID).Scan(&rankingCount))
	assert.Zero(t, instanceCount)
	assert.Zero(t, rankingCount)
}

func TestRankingRunDirtyTracksDuplicateGroupReassignment(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	canonicalID := uuid.New()
	duplicateID := uuid.New()
	insertDirtyTestRanking(t, pool, store, realmID, canonicalID)
	insertDirtyTestRanking(t, pool, store, realmID, duplicateID)

	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := pool.Exec(ctx, "DELETE FROM ranking_run_summary_dirty WHERE run_id = ANY($1)", []uuid.UUID{canonicalID, duplicateID})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
    UPDATE log_instances
    SET duplicate_group_id = $1
    WHERE id = ANY($2)
  `, canonicalID, []uuid.UUID{canonicalID, duplicateID})
	require.NoError(t, err)

	canonical := readDirtyRankingRun(t, pool, canonicalID)
	obsolete := readDirtyRankingRun(t, pool, duplicateID)
	assert.Equal(t, int64(1), canonical.generation)
	assert.Equal(t, int64(1), obsolete.generation)
	assert.Equal(t, canonical.lastTransactionID, obsolete.lastTransactionID)

	_, err = pool.Exec(ctx, "DELETE FROM log_instances WHERE id = $1", duplicateID)
	require.NoError(t, err)
	assert.Equal(t, int64(2), readDirtyRankingRun(t, pool, canonicalID).generation)
}
