package serviceratings

import (
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDirectIntegrationOverlappingRepairAndDeletion(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	publish := func() {
		t.Helper()
		require.NoError(t, s.db.InTx(ctx, func(tx database.Store) error {
			runs, err := PrepareDirectRunsTx(ctx, tx, []uuid.UUID{s.instance})
			if err != nil {
				return err
			}
			return PublishDirectRunsTx(ctx, tx, runs)
		}, nil))
	}
	publish()
	generation, err := s.db.GetLeaderboardHighlightGeneration(ctx, s.tenant)
	require.NoError(t, err)
	require.EqualValues(t, 1, generation, "direct publication must invalidate highlights")
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
	s.enqueueRun()
	claim := s.claim()
	old := s.compute()
	require.NoError(t, s.db.InTx(ctx, func(tx database.Store) error {
		runs, err := PrepareDirectRunsTx(ctx, tx, []uuid.UUID{s.instance})
		if err != nil {
			return err
		}
		raw, ok := database.PGXTx(tx)
		require.True(t, ok)
		if _, err := raw.Exec(ctx, `UPDATE encounter_dps_rankings SET player_spec='Fire',dps=200 WHERE instance_id=$1`, s.instance); err != nil {
			return err
		}
		return PublishDirectRunsTx(ctx, tx, runs)
	}, nil))
	w := RepairWorker{Store: s.db}
	require.NoError(t, w.publish(ctx, claim, old))
	var revision int64
	require.NoError(t, s.row(`SELECT revision FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&revision))
	require.Equal(t, int64(2), revision)
	_, err = w.Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	var spec string
	require.NoError(t, s.row(`SELECT player_spec FROM leaderboard_player_observations WHERE tenant_id=$1 AND metric='dps'`, s.tenant).Scan(&spec))
	require.Equal(t, "Fire", spec)
	require.NoError(t, s.db.InTx(ctx, func(tx database.Store) error {
		if err := EnqueueSourceRepairTx(ctx, tx, []uuid.UUID{s.instance}); err != nil {
			return err
		}
		raw, ok := database.PGXTx(tx)
		require.True(t, ok)
		_, err := raw.Exec(ctx, `DELETE FROM log_instances WHERE id=$1`, s.instance)
		return err
	}, nil))
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 1, count)
	_, err = w.Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
}

func TestSourceRepairBumpsHighlightGenerationAtomically(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	generation, err := s.db.GetLeaderboardHighlightGeneration(ctx, s.tenant)
	require.NoError(t, err)
	require.Zero(t, generation)
	require.ErrorContains(t, s.db.InTx(ctx, func(tx database.Store) error {
		if err := EnqueueSourceRepairTx(ctx, tx, []uuid.UUID{s.instance}); err != nil {
			return err
		}
		return errors.New("rollback source change")
	}, nil), "rollback source change")
	generation, err = s.db.GetLeaderboardHighlightGeneration(ctx, s.tenant)
	require.NoError(t, err)
	require.Zero(t, generation)
	require.NoError(t, s.db.InTx(ctx, func(tx database.Store) error {
		return EnqueueSourceRepairTx(ctx, tx, []uuid.UUID{s.instance, s.instance})
	}, nil))
	generation, err = s.db.GetLeaderboardHighlightGeneration(ctx, s.tenant)
	require.NoError(t, err)
	require.EqualValues(t, 1, generation)
}

func TestDirectIntegrationTenantScope(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	resolved, err := SourceContext(s.ctx, s.db, []uuid.UUID{s.instance})
	require.NoError(t, err)
	require.Equal(t, s.tenant, servicetenant.TenantIDFromContext(resolved))
	require.NoError(t, s.db.InTx(resolved, func(tx database.Store) error {
		runs, err := PrepareDirectRunsTx(resolved, tx, []uuid.UUID{s.instance})
		if err != nil {
			return err
		}
		require.Len(t, runs, 1)
		return PublishDirectRunsTx(resolved, tx, runs)
	}, nil))
	other := servicetenant.WithTenantID(s.ctx, uuid.New())
	rows, err := s.db.ProjectLeaderboardRun(other, database.ProjectLeaderboardRunParams{TenantID: s.tenant, RunID: s.run})
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestSourceIdentityLookupUsesBoundedEvidenceIndexes(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.times()
	require.NoError(t, s.direct(s.compute()))
	tables := []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"}
	for _, table := range tables {
		s.exec("INSERT INTO leaderboard_" + table + " SELECT(jsonb_populate_record(NULL::leaderboard_" + table + ",to_jsonb(o)||jsonb_build_object('run_id',md5('unrelated-run'||g)::uuid,'source_instance_id',md5('unrelated-instance'||g)::uuid,'tenant_id',md5('unrelated-tenant'||(g%10))::uuid))).* FROM (SELECT * FROM leaderboard_" + table + " LIMIT 1) o CROSS JOIN generate_series(1,10000) g")
		s.exec("ANALYZE leaderboard_" + table)
	}
	source, err := os.ReadFile("../../../database/queries/leaderboard_integration.sql")
	require.NoError(t, err)
	query := strings.ReplaceAll(string(source), "@ids::uuid[]", "$1::uuid[]")
	var plan []byte
	require.NoError(t, s.row("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+query, []uuid.UUID{s.instance}).Scan(&plan))
	for _, table := range tables {
		require.Contains(t, string(plan), "leaderboard_"+table+"_run_lookup_idx")
		require.Contains(t, string(plan), "leaderboard_"+table+"_source_lookup_idx")
	}
	var parsed []map[string]any
	require.NoError(t, json.Unmarshal(plan, &parsed))
	t.Logf("indexed old/source lookup with50000 unrelated evidence rows: %.3fms", parsed[0]["Execution Time"])
	rows, err := s.db.LeaderboardRunKeysForIDs(s.tenantctx(), []uuid.UUID{s.instance})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, s.run, rows[0].RunID)
	// Old identity remains discoverable after both source and canonical deletion.
	s.exec(`DELETE FROM log_instances WHERE id=$1`, s.instance)
	rows, err = s.db.LeaderboardRunKeysForIDs(s.tenantctx(), []uuid.UUID{s.instance})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, s.run, rows[0].RunID)
}
