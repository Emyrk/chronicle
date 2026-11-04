package database_test

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

// No realm-group membership or Renown manifest is needed for Peak/Mastery
// evidence. The tenant staging page includes every parsed encounter.
func TestTenantRatingStageIncludesUnassignedRealmsAndBosses(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, store, firstRealm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	var server uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id=$1", firstRealm).Scan(&server))
	secondRealm := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1,$2,'other-realm')", secondRealm, server)
	require.NoError(t, err)
	for i, realm := range []uuid.UUID{firstRealm, secondRealm} {
		instance := uuid.New()
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: instance, instanceName: "Uncurated Raid", encounterName: "Uncurated Boss",
			playerGUID: "cross-realm-player", playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, durationSecs: 10, dps: float64(100 + i),
			killedAt: time.Now().UTC().Add(-time.Hour), isBoss: true,
		})
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{instance})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	var generation uuid.UUID
	for i := 0; i < 3; i++ {
		id, _, err := servicerankings.StageTenantRatingEvidenceStep(ctx, store, uuid.Nil, time.Now().UTC())
		require.NoError(t, err)
		generation = id
	}
	var realms int
	require.NoError(t, conn.QueryRow(ctx, `SELECT count(DISTINCT realm_id) FROM rating_stage_player_observations
		WHERE generation_id=$1 AND instance_name='Uncurated Raid' AND encounter_name='Uncurated Boss'`, generation).Scan(&realms))
	require.Equal(t, 2, realms)
	// The scheduled worker resumes this tenant checkpoint. An invocation that stops
	// partway snoozes and must not publish; the generation goes active only once
	// every phase has completed.
	job := &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: uuid.Nil}}
	status := func() (string, string) {
		var generationStatus, phase string
		require.NoError(t, conn.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id=$1", generation).Scan(&generationStatus))
		require.NoError(t, conn.QueryRow(ctx, "SELECT phase FROM rating_rebuild_checkpoints WHERE generation_id=$1", generation).Scan(&phase))
		return generationStatus, phase
	}
	oneStep := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default(), PagesPerInvocation: 1}
	err = oneStep.Work(ctx, job)
	var snooze *river.JobSnoozeError
	require.ErrorAs(t, err, &snooze, "a partial invocation snoozes")
	generationStatus, phase := status()
	require.Equal(t, "building", generationStatus)
	require.NotEqual(t, "complete", phase)
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	for i := 0; ; i++ {
		require.Less(t, i, 20, "rebuild did not finish")
		if err = worker.Work(ctx, job); err == nil {
			break
		}
		require.ErrorAs(t, err, &snooze)
		generationStatus, _ = status()
		require.Equal(t, "building", generationStatus, "never published before the rebuild finishes")
	}
	generationStatus, phase = status()
	require.Equal(t, "active", generationStatus)
	require.Equal(t, "complete", phase)
}

// Compare the incremental raw-best and roster-aware scope projections against
// a published full rebuild over the same canonical runs.
func TestIncrementalPeakMatchesFullRebuildForCanonicalRuns(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, store, realm := setupParsesTest(t)
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{
		RealmID: realm, Name: "peak-parity-guild", CreatedAt: database.Timestamptz(time.Now().UTC()),
	})
	require.NoError(t, err)
	for i, raw := range []float64{100, 200} {
		run := uuid.New()
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: run, instanceName: "Uncurated Raid", encounterName: "Uncurated Boss",
			playerGUID: fmt.Sprintf("player-%d", i), playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, durationSecs: float64(5 + 5*i), dps: raw, killedAt: time.Now().UTC().Add(-time.Hour), isBoss: true,
		})
		if i == 1 {
			_, err = pool.Exec(ctx, "UPDATE log_instances SET guild_id=$2 WHERE id=$1", run, guild.ID)
			require.NoError(t, err)
		}
		sources, err := store.RankingRunSources(ctx, []uuid.UUID{run})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	job := &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: uuid.Nil}}
	for i := 0; ; i++ {
		require.Less(t, i, 25)
		err := worker.Work(ctx, job)
		if err == nil {
			break
		}
		var snooze *river.JobSnoozeError
		require.ErrorAs(t, err, &snooze)
	}
	var generation uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, "SELECT id FROM rating_score_generations WHERE tenant_id=$1 AND status='active'", uuid.Nil).Scan(&generation))
	read := func(table string) map[string][2]float64 {
		t.Helper()
		rows, err := pool.Query(ctx, "SELECT player_guid,score,best_raw FROM "+table+
			" WHERE generation_id=$1 AND rating_metric='peak' AND window_kind='all_time'", generation)
		require.NoError(t, err)
		defer rows.Close()
		result := map[string][2]float64{}
		for rows.Next() {
			var player string
			var score float64
			var raw *float64
			require.NoError(t, rows.Scan(&player, &score, &raw))
			if raw != nil {
				result[player] = [2]float64{score, *raw}
			}
		}
		require.NoError(t, rows.Err())
		return result
	}
	fullBoss, fullScope := read("player_tenant_rating_boss_scores"), read("player_tenant_rating_scope_scores")
	require.Len(t, fullBoss, 2)
	require.Len(t, fullScope, 2)
	readGuild := func(table string) [3]float64 {
		t.Helper()
		var score float64
		var raw, rank *float64
		query := "SELECT score,best_raw,rank_one_raw FROM " + table +
			" WHERE generation_id=$1 AND guild_id=$2 AND rating_metric='peak' AND window_kind='all_time'"
		if table == "guild_tenant_rating_scope_scores" {
			query = "SELECT score,NULL::double precision,NULL::double precision FROM " + table +
				" WHERE generation_id=$1 AND guild_id=$2 AND rating_metric='peak' AND window_kind='all_time'"
		}
		require.NoError(t, pool.QueryRow(ctx, query, generation, guild.ID).Scan(&score, &raw, &rank))
		result := [3]float64{score}
		if raw != nil {
			result[1] = *raw
		}
		if rank != nil {
			result[2] = *rank
		}
		return result
	}
	fullGuildBoss, fullGuildScope := readGuild("guild_tenant_rating_boss_scores"), readGuild("guild_tenant_rating_scope_scores")
	require.InDelta(t, 50, fullGuildBoss[0], 1e-9, "guildless faster kill defines guild rank one")
	_, err = pool.Exec(ctx, "INSERT INTO rating_live_evidence_bootstraps (tenant_id,completed_at) VALUES ($1,now())", uuid.Nil)
	require.NoError(t, err)
	var runs []uuid.UUID
	rows, err := pool.Query(ctx, "SELECT run_id FROM ranking_runs")
	require.NoError(t, err)
	for rows.Next() {
		var id uuid.UUID
		require.NoError(t, rows.Scan(&id))
		runs = append(runs, id)
	}
	require.NoError(t, rows.Err())
	rows.Close()
	require.NoError(t, store.MarkDirtyObservationRunsByIDs(ctx, runs))
	processed, err := ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for i := 0; i < 2; i++ {
		processed, err = ratingmath.RefreshDirtyTenantPeak(ctx, store, uuid.Nil, time.Now().UTC())
		require.NoError(t, err)
		require.Equal(t, 1, processed)
	}
	for _, table := range []struct {
		name string
		want map[string][2]float64
	}{{"player_tenant_rating_boss_scores", fullBoss}, {"player_tenant_rating_scope_scores", fullScope}} {
		got := read(table.name)
		require.Equal(t, len(table.want), len(got), table.name)
		for player, expected := range table.want {
			require.InDelta(t, expected[0], got[player][0], 1e-9, table.name+" score for "+player)
			require.InDelta(t, expected[1], got[player][1], 1e-9, table.name+" raw for "+player)
		}
	}
	for _, table := range []struct {
		name string
		want [3]float64
	}{{"guild_tenant_rating_boss_scores", fullGuildBoss}, {"guild_tenant_rating_scope_scores", fullGuildScope}} {
		got := readGuild(table.name)
		for i := range got {
			require.InDelta(t, table.want[i], got[i], 1e-9, table.name)
		}
	}
}

// The tenant snapshot freezes the fixed policy and realm-specific flavor awards.
func TestTenantRatingCheckpointFreezesMixedFlavorManifest(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, _, vanillaRealm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	vanillaDataset, nightmareDataset := uuid.New(), uuid.New()
	for _, dataset := range []struct {
		id           uuid.UUID
		name, flavor string
	}{{vanillaDataset, "Vanilla", "vanilla"}, {nightmareDataset, "Nightmare", "nightmare-of-ursol"}} {
		_, err = conn.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor) VALUES ($1,$2,$3,'1.12',ARRAY[$4]::text[])`, dataset.id, dataset.name, uuid.NewString(), dataset.flavor)
		require.NoError(t, err)
	}
	var vanillaServer uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id=$1", vanillaRealm).Scan(&vanillaServer))
	_, err = conn.Exec(ctx, "UPDATE wow_servers SET default_dataset_id=$1 WHERE id=$2", vanillaDataset, vanillaServer)
	require.NoError(t, err)
	nightmareServer, nightmareRealm := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id,name,default_dataset_id) VALUES ($1,$2,$3)", nightmareServer, "nightmare", nightmareDataset)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id,server_id,name) VALUES ($1,$2,$3)", nightmareRealm, nightmareServer, "nightmare")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	asOf := time.Now().UTC()
	args := database.StartTenantRatingRebuildParams{TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)}
	tenants, err := q.ListRatingTenants(ctx)
	require.NoError(t, err)
	require.Contains(t, tenants, uuid.NullUUID{UUID: uuid.Nil, Valid: true}, "root servers must be scheduled without policy rows")
	id, err := q.StartTenantRatingRebuild(ctx, args)
	require.NoError(t, err)
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	var manifest struct {
		Writer string `json:"writer"`
		Policy struct {
			Version       int     `json:"version"`
			BestWeight    float64 `json:"best_weight"`
			FormWeight    float64 `json:"form_weight"`
			FloorWeight   float64 `json:"floor_weight"`
			RankOneWeight float64 `json:"rank_one_weight"`
			FullRankKills int     `json:"full_rank_kills"`
			PeriodDays    int     `json:"period_days"`
		} `json:"tenant_policy"`
		Bosses []struct {
			RealmID       uuid.UUID `json:"realm_id"`
			InstanceName  string    `json:"instance_name"`
			EncounterName string    `json:"encounter_name"`
			RenownPoints  float64   `json:"renown_points"`
		} `json:"renown_bosses"`
	}
	require.NoError(t, json.Unmarshal(cp.Manifest, &manifest))
	require.Equal(t, "tenant", manifest.Writer)
	require.Equal(t, 2, manifest.Policy.Version)
	require.Equal(t, 180, manifest.Policy.PeriodDays)
	require.InDelta(t, .35, manifest.Policy.BestWeight, 1e-9)
	require.InDelta(t, .50, manifest.Policy.FormWeight, 1e-9)
	require.InDelta(t, .15, manifest.Policy.FloorWeight, 1e-9)
	require.InDelta(t, .50, manifest.Policy.RankOneWeight, 1e-9)
	require.Equal(t, 5, manifest.Policy.FullRankKills)
	awards := map[uuid.UUID]map[string]float64{}
	for _, boss := range manifest.Bosses {
		if boss.InstanceName != "Lower Tower of Karazhan" {
			continue
		}
		if awards[boss.RealmID] == nil {
			awards[boss.RealmID] = map[string]float64{}
		}
		awards[boss.RealmID][boss.EncounterName] = boss.RenownPoints
	}
	require.Empty(t, awards[vanillaRealm], "vanilla realm must not receive Turtle-only awards")
	require.NotEmpty(t, awards[nightmareRealm], "nightmare realm receives its flavor awards")
	replayed, err := q.StartTenantRatingRebuild(ctx, args)
	require.NoError(t, err)
	require.Equal(t, id, replayed)
	frozen, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	require.JSONEq(t, string(cp.Manifest), string(frozen.Manifest))
	// A flavor change after the snapshot must fence publication, not silently
	// publish the old realm's awards under its new flavor.
	_, err = conn.Exec(ctx, `UPDATE rating_rebuild_checkpoints SET phase='ready' WHERE generation_id=$1`, id)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `UPDATE datasets SET default_flavor=ARRAY['vanilla']::text[] WHERE id=$1`, nightmareDataset)
	require.NoError(t, err)
	revision, err := q.GetRatingConfigRevision(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Greater(t, revision, cp.ConfigRevision)
	published, err := q.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	require.False(t, published)
}
