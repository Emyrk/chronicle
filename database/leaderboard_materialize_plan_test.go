package database_test

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Opt-in measurements use only a new dbtestutil database. They neither connect to
// production nor touch a preview fixture. EXPLAIN ANALYZE executes publication;
// everything is rolled back with the fixture transaction at the end.
func TestMaterializeScopedPlans(t *testing.T) {
	if os.Getenv("CHRONICLE_MEASURE_MATERIALIZE") != "1" {
		t.Skip("opt-in local EXPLAIN ANALYZE measurements")
	}
	t.Parallel()
	f := newMaterializeFixture(t)
	f.ctx = testutil.Context(t, testutil.WaitSuperLong)
	f.add(100, 1000, uuid.New())
	evidence := []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"}
	samples := map[string]string{}
	for _, table := range evidence {
		var sample []byte
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT to_jsonb(o) FROM leaderboard_"+table+" o WHERE tenant_id=$1", f.tenant).Scan(&sample))
		samples[table] = string(sample)
	}
	load := func(n int, unrelated bool) {
		t.Helper()
		for _, table := range evidence {
			tenantExpr := "$2::uuid"
			raidExpr := "'Test raid'"
			if unrelated {
				tenantExpr = "md5('unrelated tenant '||(g%16))::uuid"
				raidExpr = "'Unrelated raid '||(g%32)"
			} else {
				f.exec("DELETE FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant)
			}
			f.exec("INSERT INTO leaderboard_"+table+" SELECT (jsonb_populate_record(NULL::leaderboard_"+table+", $1::jsonb || jsonb_build_object('tenant_id',"+tenantExpr+",'instance_name',"+raidExpr+",'run_id',md5($2::text||g::text)::uuid,'metric_value',(g%1000)::double precision,'duration_ms',100+(g%997)))).* FROM generate_series(1,$3::integer) g", samples[table], f.tenant, n)
		}
	}
	// Populate actual peak-source hierarchy so provenance reads are measured.
	user, server, group := uuid.New(), uuid.New(), uuid.New()
	f.exec(`INSERT INTO tenants(id,name) VALUES($1,'Measurement tenant')`, f.tenant)
	f.exec(`INSERT INTO users(id,username,email) VALUES($1,$2,$3)`, user, user.String(), user.String()+"@example.invalid")
	f.exec(`INSERT INTO wow_servers(id,name,tenant_id) VALUES($1,'Measurement server',$2)`, server, f.tenant)
	f.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Measurement realm')`, f.realm, server)
	f.exec(`INSERT INTO wow_log_groups(id,owner,created_at,updated_at) VALUES($1,$2,now(),now())`, group, user)
	f.exec(`INSERT INTO parsed_log_group(id) VALUES($1)`, group)
	f.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players) SELECT source_instance_id,realm_id,$2,instance_name,difficulty_name,max_players FROM leaderboard_player_observations WHERE tenant_id=$1`, f.tenant, group)
	f.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) SELECT source_encounter_id,source_instance_id,encounter_name,'{}',true,'2026-01-01Z'::timestamptz,'2026-01-01Z'::timestamptz+interval '1 second','clean' FROM leaderboard_player_observations WHERE tenant_id=$1`, f.tenant)
	f.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) SELECT gen_random_uuid(),source_instance_id,'Other encounter','{}',true,'2026-01-01Z'::timestamptz,'2026-01-01Z'::timestamptz+interval '1 second','clean' FROM leaderboard_player_observations CROSS JOIN generate_series(1,5000) WHERE tenant_id=$1`, f.tenant)
	load(30000, true)
	load(10000, false)
	source, err := os.ReadFile("queries/leaderboard_materialize.sql")
	require.NoError(t, err)
	parts := regexp.MustCompile(`(?m)^-- name: `).Split(string(source), -1)
	queries := map[string]string{}
	replacements := map[string]string{"tenant_id": "'" + f.tenant.String() + "'", "realm_id": "'" + f.realm.String() + "'", "guild_id": "'" + f.guild.String() + "'", "instance_name": "'Test raid'", "encounter_name": "'Boss'", "difficulty_name": "'10 Player'", "max_players": "10", "player_guid": "'Player'", "player_class": "'MAGE'", "player_spec": "'Frost'", "player_sub_spec": "''", "metric": "'dps'", "projection_version": "7", "algorithm_version": "11"}
	argPattern := regexp.MustCompile(`@([a-z_]+)`)
	for _, part := range parts[1:] {
		lines := strings.SplitN(part, "\n", 2)
		name := strings.Fields(lines[0])[0]
		queries[name] = argPattern.ReplaceAllStringFunc(lines[1], func(s string) string { return replacements[s[1:]] })
	}
	measure := func(label string, n int, benchmarksOnly bool) {
		t.Helper()
		names := make([]string, 0, len(queries))
		for name := range queries {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if benchmarksOnly && !strings.HasSuffix(name, "Benchmark") {
				continue
			}
			var times []float64
			var wal, reads, spill, sortKB float64
			var indexes []string
			for range 7 {
				var raw []byte
				require.NoError(t, f.conn.QueryRow(f.ctx, "EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) "+queries[name]).Scan(&raw))
				var plans []map[string]any
				require.NoError(t, json.Unmarshal(raw, &plans))
				times = append(times, plans[0]["Execution Time"].(float64))
				root := plans[0]["Plan"].(map[string]any)
				number := func(m map[string]any, k string) float64 { v, _ := m[k].(float64); return v }
				wal = 0
				sortKB = 0
				reads = number(root, "Shared Hit Blocks") + number(root, "Shared Read Blocks")
				spill = number(root, "Temp Written Blocks")
				indexes = nil
				var walk func(map[string]any)
				walk = func(node map[string]any) {
					if node["Node Type"] == "ModifyTable" {
						wal += number(node, "WAL Bytes")
					}
					if number(node, "Sort Space Used") > sortKB {
						sortKB = number(node, "Sort Space Used")
					}
					if number(node, "Temp Written Blocks") > spill {
						spill = number(node, "Temp Written Blocks")
					}

					if idx, ok := node["Index Name"].(string); ok {
						indexes = append(indexes, fmt.Sprintf("%s(rows=%.0f,loops=%.0f)", idx, number(node, "Actual Rows"), number(node, "Actual Loops")))
					}
					if label == "indexed" && node["Node Type"] == "Seq Scan" {
						if rel, ok := node["Relation Name"].(string); ok && strings.HasPrefix(rel, "leaderboard_") {
							t.Errorf("unbounded evidence/summary scan: %s", rel)
						}
					}
					if children, ok := node["Plans"].([]any); ok {
						for _, child := range children {
							walk(child.(map[string]any))
						}
					}
				}
				walk(root)
			}
			sort.Float64s(times)
			t.Logf("MEASURE %s n=%d %s p50=%.3fms p95=%.3fms wal=%.0fB blocks=%.0f temp_written=%.0f sort_kb=%.0f indexes=%s", label, n, name, times[3], times[6], wal, reads, spill, sortKB, strings.Join(indexes, ","))
		}
	}
	// Drop only candidate indexes inside this isolated test transaction so the
	// before/after comparison remains reproducible once migration347 exists.
	indexes := []struct{ name, table, columns string }{
		{"leaderboard_player_observations_best_idx", "player_observations", "tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,metric_value DESC"},
		{"leaderboard_guild_boss_observations_best_idx", "guild_boss_observations", "tenant_id,instance_name,difficulty_name,max_players,encounter_name,duration_ms"},
		{"leaderboard_guild_clear_observations_best_idx", "guild_clear_observations", "tenant_id,instance_name,difficulty_name,max_players,duration_ms"},
	}
	f.exec("RESET ROLE")
	for _, index := range indexes {
		f.exec("DROP INDEX IF EXISTS " + index.name)
	}
	for _, table := range evidence {
		f.exec("ANALYZE leaderboard_" + table)
	}
	f.exec("ANALYZE log_instance_encounters")
	f.exec("ANALYZE log_instances")
	f.exec("SET ROLE chronicle")
	measure("existing", 10000, true)
	f.exec("RESET ROLE")
	for _, index := range indexes {
		f.exec("CREATE INDEX " + index.name + " ON leaderboard_" + index.table + " (" + index.columns + ")")
	}
	f.exec("SET ROLE chronicle")
	for _, n := range []int{100, 1000, 10000} {
		load(n, false)
		f.exec("RESET ROLE")
		for _, table := range evidence {
			f.exec("ANALYZE leaderboard_" + table)
		}
		f.exec("SET ROLE chronicle")
		measure("indexed", n, false)
	}
}
