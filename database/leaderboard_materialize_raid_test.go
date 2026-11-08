package database_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Opt-in capacity diagnostic, not a worker or batching implementation. Every
// refresh below is one real sqlc call for one exact deduplicated result scope.
func TestMaterializeWholeRaid(t *testing.T) {
	if os.Getenv("CHRONICLE_MEASURE_RAID") != "1" {
		t.Skip("opt-in isolated whole-raid workload")
	}
	// Sequential cells bound local disk/CPU pressure; each gets its own test DB.
	for _, history := range []int{10, 100, 1000} {
		for _, metrics := range []int{1, 2} {
			t.Run(fmt.Sprintf("history%d_metrics%d", history, metrics), func(t *testing.T) {
				ctx := testutil.Context(t, 3*time.Minute)
				pool, _ := dbtestutil.NewPGXPool(t)
				conn, err := pool.Acquire(ctx)
				require.NoError(t, err)
				defer conn.Release()
				_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
				require.NoError(t, err)
				tenant, realm, guild, other := uuid.New(), uuid.New(), uuid.New(), uuid.New()
				exec := func(query string, args ...any) {
					t.Helper()
					_, err := conn.Exec(ctx, query, args...)
					require.NoError(t, err)
				}
				// A synthetic MC-shaped fixture, not an invented production difficulty rule.
				// 8 distinct cohorts, 5 players each. Source IDs are absent: these measurements
				// include nullable provenance lookup, not source-retention/client-read work.
				classes := []string{"WARRIOR", "MAGE", "PRIEST", "ROGUE", "HUNTER", "WARLOCK", "DRUID", "SHAMAN"}
				specs := []string{"Fury", "Frost", "Holy", "Combat", "Marksmanship", "Destruction", "Restoration", "Restoration"}
				exec(`CREATE TEMP TABLE raid_roster (p integer PRIMARY KEY, player_class text, player_spec text)`)
				for p := range 40 {
					exec(`INSERT INTO raid_roster VALUES($1,$2,$3)`, p, classes[p/5], specs[p/5])
				}
				seed := func(id uuid.UUID, first, last int, raid string) {
					t.Helper()
					// No per-row Go evidence writer; this is only bounded SQL test-fixture setup.
					exec(`INSERT INTO leaderboard_player_observations
     (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,player_guid,source_encounter_id,source_ranking_id,player_class,player_spec,player_sub_spec,metric,metric_value,projection_version,observed_at)
     SELECT $1::uuid,$2::text,'40 Player',40,'Boss '||b,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h)::uuid,$3,'Player '||p,md5($1::uuid::text||h||'boss'||b)::uuid,md5($1::uuid::text||h||'boss'||b||'player'||p)::uuid,
      player_class,player_spec,'',CASE m WHEN 1 THEN 'dps' ELSE 'hps' END,100+(h*17+p*31+b*11)%1000,1,'2026-01-01Z'
     FROM generate_series($4::int,$5::int) h CROSS JOIN generate_series(1,12) b CROSS JOIN raid_roster CROSS JOIN generate_series(1,$6::int) m`, id, raid, realm, first, last, metrics)
					exec(`INSERT INTO leaderboard_player_renown_facts
     (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,player_guid,source_encounter_id,projection_version,observed_at)
     SELECT $1::uuid,$2::text,'40 Player',40,'Boss '||b,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h)::uuid,$3,'Player '||p,md5($1::uuid::text||h||'boss'||b)::uuid,1,'2026-01-01Z'
     FROM generate_series($4::int,$5::int) h CROSS JOIN generate_series(1,12) b CROSS JOIN raid_roster`, id, raid, realm, first, last)
					exec(`INSERT INTO leaderboard_guild_boss_observations
     (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,guild_id,source_time_parse_score_id,source_encounter_id,duration_ms,projection_version,observed_at)
     SELECT $1::uuid,$2::text,'40 Player',40,'Boss '||b,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h)::uuid,$3,$4,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h||'boss'||b)::uuid,60000+(h*17+b*31)%10000,1,'2026-01-01Z'
     FROM generate_series($5::int,$6::int) h CROSS JOIN generate_series(1,12) b`, id, raid, realm, guild, first, last)
					exec(`INSERT INTO leaderboard_guild_renown_facts
     (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,guild_id,source_encounter_id,projection_version,observed_at)
     SELECT $1::uuid,$2::text,'40 Player',40,'Boss '||b,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h)::uuid,$3,$4,md5($1::uuid::text||h||'boss'||b)::uuid,1,'2026-01-01Z'
     FROM generate_series($5::int,$6::int) h CROSS JOIN generate_series(1,12) b`, id, raid, realm, guild, first, last)
					exec(`INSERT INTO leaderboard_guild_clear_observations
     (tenant_id,instance_name,difficulty_name,max_players,run_id,source_instance_id,realm_id,guild_id,source_time_parse_score_id,duration_ms,projection_version,observed_at)
     SELECT $1::uuid,$2::text,'40 Player',40,md5($1::uuid::text||h)::uuid,md5($1::uuid::text||h)::uuid,$3,$4,md5($1::uuid::text||h)::uuid,3600000+(h*17)%10000,1,'2026-01-01Z'
     FROM generate_series($5::int,$6::int) h`, id, raid, realm, guild, first, last)
				}
				db := database.NewQueries(conn)
				refresh := func(runctx context.Context) int {
					t.Helper()
					calls := 0
					call := func(err error) { t.Helper(); require.NoError(t, err); calls++ }
					for b := 1; b <= 12; b++ {
						boss := fmt.Sprintf("Boss %d", b)
						for m := range metrics {
							metric := []string{"dps", "hps"}[m]
							for c := range 8 {
								call(db.MaterializeLeaderboardPlayerBossBenchmark(runctx, database.MaterializeLeaderboardPlayerBossBenchmarkParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, PlayerClass: classes[c], PlayerSpec: specs[c], PlayerSubSpec: "", Metric: metric, ProjectionVersion: 1, AlgorithmVersion: 1}))
							}
							for p := range 40 {
								call(db.MaterializeLeaderboardPlayerBossSubject(runctx, database.MaterializeLeaderboardPlayerBossSubjectParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, PlayerClass: classes[p/5], PlayerSpec: specs[p/5], PlayerSubSpec: "", Metric: metric, RealmID: realm, PlayerGuid: fmt.Sprintf("Player %d", p), ProjectionVersion: 1, AlgorithmVersion: 1}))
							}
						}
						for p := range 40 {
							call(db.MaterializeLeaderboardPlayerRenownCount(runctx, database.MaterializeLeaderboardPlayerRenownCountParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, RealmID: realm, PlayerGuid: fmt.Sprintf("Player %d", p), ProjectionVersion: 1, AlgorithmVersion: 1}))
						}
						call(db.MaterializeLeaderboardGuildBossBenchmark(runctx, database.MaterializeLeaderboardGuildBossBenchmarkParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, ProjectionVersion: 1, AlgorithmVersion: 1}))
						call(db.MaterializeLeaderboardGuildBossSubject(runctx, database.MaterializeLeaderboardGuildBossSubjectParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, RealmID: realm, GuildID: guild, ProjectionVersion: 1, AlgorithmVersion: 1}))
						call(db.MaterializeLeaderboardGuildRenownCount(runctx, database.MaterializeLeaderboardGuildRenownCountParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, EncounterName: boss, RealmID: realm, GuildID: guild, ProjectionVersion: 1, AlgorithmVersion: 1}))
					}
					call(db.MaterializeLeaderboardGuildClearBenchmark(runctx, database.MaterializeLeaderboardGuildClearBenchmarkParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, ProjectionVersion: 1, AlgorithmVersion: 1}))
					call(db.MaterializeLeaderboardGuildClearSubject(runctx, database.MaterializeLeaderboardGuildClearSubjectParams{TenantID: tenant, InstanceName: "Raid fixture", DifficultyName: "40 Player", MaxPlayers: 40, RealmID: realm, GuildID: guild, ProjectionVersion: 1, AlgorithmVersion: 1}))
					return calls
				}
				start := time.Now()
				exec("BEGIN")
				seed(tenant, 1, history, "Raid fixture")
				seed(other, 1, 100, "Unrelated raid")
				exec("COMMIT")
				seedTime := time.Since(start)
				// ANALYZE needs the test migration owner; restore application RLS role.
				exec("RESET ROLE")
				for _, table := range []string{"player_observations", "player_renown_facts", "guild_boss_observations", "guild_renown_facts", "guild_clear_observations"} {
					exec("ANALYZE leaderboard_" + table)
				}
				exec("SET ROLE chronicle")
				start = time.Now()
				exec("BEGIN")
				priorCalls := refresh(ctx)
				exec("COMMIT")
				priorTime := time.Since(start)
				var lsn string
				require.NoError(t, conn.QueryRow(ctx, `SELECT pg_current_wal_insert_lsn()::text`).Scan(&lsn))
				start = time.Now()
				exec("BEGIN")
				seed(tenant, history+1, history+1, "Raid fixture")
				exec("COMMIT")
				insertTime := time.Since(start)
				var insertWAL int64
				require.NoError(t, conn.QueryRow(ctx, `SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1::pg_lsn)::bigint`, lsn).Scan(&insertWAL))
				expectedCalls := 518 + 576*metrics // 985/1465 subjects/counts +109/205 benchmarks
				require.Equal(t, expectedCalls, priorCalls)
				for _, mode := range []string{"transaction", "autocommit"} {
					// Autocommit repeats the exact same final evidence after the transaction
					// pass. This is a warm idempotent publication comparison, not a second raid.
					runctx, cancel := context.WithTimeout(ctx, 30*time.Second)
					require.NoError(t, conn.QueryRow(runctx, `SELECT pg_current_wal_insert_lsn()::text`).Scan(&lsn))
					start = time.Now()
					if mode == "transaction" {
						_, err = conn.Exec(runctx, "BEGIN")
						require.NoError(t, err)
					}
					calls := refresh(runctx)
					if mode == "transaction" {
						_, err = conn.Exec(runctx, "COMMIT")
						require.NoError(t, err)
					}
					elapsed := time.Since(start)
					var wal int64
					require.NoError(t, conn.QueryRow(runctx, `SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1::pg_lsn)::bigint`, lsn).Scan(&wal))
					cancel()
					require.Equal(t, expectedCalls, calls)
					t.Logf("RAID history=%d metrics=%d mode=%s evidence_append=%d refresh_calls=%d initial_seed_ms=%.1f prior_materialize_ms=%.1f append_ms=%.1f append_cluster_wal=%d refresh_ms=%.1f refresh_cluster_wal=%d", history, metrics, mode, 505+480*metrics, calls, float64(seedTime.Microseconds())/1000, float64(priorTime.Microseconds())/1000, float64(insertTime.Microseconds())/1000, insertWAL, float64(elapsed.Microseconds())/1000, wal)
				}
				expectedRows := map[string]int64{
					"player_boss_subjects": int64(480 * metrics), "player_renown_counts": 480,
					"guild_boss_subjects": 12, "guild_renown_counts": 12, "guild_clear_subjects": 1,
					"player_boss_benchmarks": int64(96 * metrics), "guild_boss_benchmarks": 12, "guild_clear_benchmarks": 1,
				}
				for table, want := range expectedRows {
					var count int64
					require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM leaderboard_"+table+" WHERE tenant_id=$1", tenant).Scan(&count))
					require.Equal(t, want, count, table)
				}
				var summaries, facts, minCount, maxCount int64
				require.NoError(t, conn.QueryRow(ctx, `SELECT count(*),min(observation_count),max(observation_count) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, tenant).Scan(&summaries, &minCount, &maxCount))
				require.Equal(t, int64(480*metrics), summaries)
				require.Equal(t, int64(history+1), minCount)
				require.Equal(t, minCount, maxCount)
				require.NoError(t, conn.QueryRow(ctx, `SELECT count(*),min(kill_count),max(kill_count) FROM leaderboard_player_renown_counts WHERE tenant_id=$1`, tenant).Scan(&facts, &minCount, &maxCount))
				require.Equal(t, int64(480), facts)
				require.Equal(t, int64(history+1), minCount)
				require.Equal(t, minCount, maxCount)
			})
		}
	}
}
