package database_test

import (
	"context"
	"fmt"
	"os"
	"sort"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

type materializeFixture struct {
	t                    *testing.T
	ctx                  context.Context
	conn                 *pgxpool.Conn
	db                   database.StoreQueries
	tenant, realm, guild uuid.UUID
}

func newMaterializeFixture(t *testing.T) *materializeFixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "BEGIN; SET LOCAL app.tenant_bypass = 'true'")
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = conn.Exec(context.Background(), "ROLLBACK"); conn.Release() })
	return &materializeFixture{t, ctx, conn, database.NewQueries(conn), uuid.New(), uuid.New(), uuid.New()}
}
func (f *materializeFixture) exec(q string, args ...any) {
	f.t.Helper()
	_, err := f.conn.Exec(f.ctx, q, args...)
	require.NoError(f.t, err)
}
func (f *materializeFixture) calculate() {
	f.t.Helper()
	require.NoError(f.t, f.db.MaterializeLeaderboardPlayerBossBenchmark(f.ctx, database.MaterializeLeaderboardPlayerBossBenchmarkParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerSubSpec: "", Metric: "dps", ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardPlayerBossSubject(f.ctx, database.MaterializeLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerSubSpec: "", Metric: "dps", RealmID: f.realm, PlayerGuid: "Player", ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardGuildBossBenchmark(f.ctx, database.MaterializeLeaderboardGuildBossBenchmarkParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardGuildBossSubject(f.ctx, database.MaterializeLeaderboardGuildBossSubjectParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", RealmID: f.realm, GuildID: f.guild, ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardGuildClearBenchmark(f.ctx, database.MaterializeLeaderboardGuildClearBenchmarkParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardGuildClearSubject(f.ctx, database.MaterializeLeaderboardGuildClearSubjectParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, RealmID: f.realm, GuildID: f.guild, ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardPlayerRenownCount(f.ctx, database.MaterializeLeaderboardPlayerRenownCountParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", RealmID: f.realm, PlayerGuid: "Player", ProjectionVersion: 7, AlgorithmVersion: 11}))
	require.NoError(f.t, f.db.MaterializeLeaderboardGuildRenownCount(f.ctx, database.MaterializeLeaderboardGuildRenownCountParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", RealmID: f.realm, GuildID: f.guild, ProjectionVersion: 7, AlgorithmVersion: 11}))
}

// Fixture SQL is test-only. Production calculations exclusively use sqlc.
func (f *materializeFixture) add(metric float64, duration int64, encounter uuid.UUID) {
	run, instance := uuid.New(), uuid.New()
	f.exec(`INSERT INTO leaderboard_player_observations
 (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,player_guid,source_encounter_id,source_ranking_id,player_class,player_spec,player_sub_spec,metric,metric_value,projection_version,observed_at)
 VALUES ($1,'Test raid','10 Player',10,'Boss',$2,$3,$4,'Player',$5,$6,'MAGE','Frost','','dps',$7,1,now())`, f.tenant, run, instance, f.realm, encounter, uuid.New(), metric)
	f.exec(`INSERT INTO leaderboard_guild_boss_observations
 (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,guild_id,source_time_parse_score_id,source_encounter_id,duration_ms,projection_version,observed_at)
 VALUES ($1,'Test raid','10 Player',10,'Boss',$2,$3,$4,$5,$6,$7,$8,1,now())`, f.tenant, run, instance, f.realm, f.guild, uuid.New(), encounter, duration)
	f.exec(`INSERT INTO leaderboard_guild_clear_observations
 (tenant_id,instance_name,difficulty_name,max_players,run_id,source_instance_id,realm_id,guild_id,source_time_parse_score_id,duration_ms,projection_version,observed_at)
 VALUES ($1,'Test raid','10 Player',10,$2,$3,$4,$5,$6,$7,1,now())`, f.tenant, run, instance, f.realm, f.guild, uuid.New(), duration)
	f.exec(`INSERT INTO leaderboard_player_renown_facts
 (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,player_guid,source_encounter_id,projection_version,observed_at)
 VALUES ($1,'Test raid','10 Player',10,'Boss',$2,$3,$4,'Player',$5,1,now())`, f.tenant, run, instance, f.realm, encounter)
	f.exec(`INSERT INTO leaderboard_guild_renown_facts
 (tenant_id,instance_name,difficulty_name,max_players,encounter_name,run_id,source_instance_id,realm_id,guild_id,source_encounter_id,projection_version,observed_at)
 VALUES ($1,'Test raid','10 Player',10,'Boss',$2,$3,$4,$5,$6,1,now())`, f.tenant, run, instance, f.realm, f.guild, encounter)
}

// Oracle operates on a full in-memory copy, independently of SQL/window functions.
func rawOracle(input []float64) (peak, form, floor float64) {
	if len(input) == 0 {
		return
	}
	values := append([]float64(nil), input...)
	sort.Float64s(values)
	n := len(values)
	peak = values[n-1]
	average := func(a []float64) float64 {
		if len(a) == 0 {
			return 0
		}
		var sum float64
		for _, v := range a {
			sum += v
		}
		return sum / float64(len(a))
	}
	floor = average(values[n/5 : n*2/5])
	form = average(values[n*2/5 : n-1])
	return
}

func TestMaterializeHistories(t *testing.T) {
	t.Parallel()
	for _, n := range []int{0, 1, 2, 3, 4, 5, 9, 10, 11, 101} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			f := newMaterializeFixture(t)
			metrics := make([]float64, n)
			inverse := make([]float64, n)
			// Deliberately unsorted and tied, including zero metrics and nonuniform durations.
			for i := range n {
				metrics[i] = float64((i*17 + 3) % 11)
				d := int64(100 + (i*31)%137)
				inverse[i] = 1 / float64(d)
				f.add(metrics[i], d, uuid.New())
			}
			f.calculate()
			f.calculate() // idempotent upsert, not duplicate summaries
			tables := []string{"player_boss_benchmarks", "player_boss_subjects", "guild_boss_benchmarks", "guild_boss_subjects", "guild_clear_benchmarks", "guild_clear_subjects", "player_renown_counts", "guild_renown_counts"}
			for _, table := range tables {
				var count int
				require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT count(*) FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant).Scan(&count))
				if n == 0 {
					require.Zero(t, count)
				} else {
					require.Equal(t, 1, count)
				}
			}
			if n == 0 {
				return
			}
			p, form, floor := rawOracle(metrics)
			var gotPeak, gotForm, gotFloor, best float64
			var count int64
			var pv, av int32
			require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count, &gotPeak, &gotForm, &gotFloor, &pv, &av))
			require.Equal(t, int64(n), count)
			require.Equal(t, int32(7), pv)
			require.Equal(t, int32(11), av)
			require.InDelta(t, p, gotPeak, 1e-12)
			require.InDelta(t, form, gotForm, 1e-12)
			require.InDelta(t, floor, gotFloor, 1e-12)
			require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT best_metric FROM leaderboard_player_boss_benchmarks WHERE tenant_id=$1`, f.tenant).Scan(&best))
			require.Equal(t, p, best)
			gp, gform, gfloor := rawOracle(inverse)
			for _, kind := range []string{"boss", "clear"} {
				var fastest, benchmark int64
				require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT observation_count,fastest_duration_ms,form_mean_inverse_ms,floor_mean_inverse_ms FROM leaderboard_guild_"+kind+"_subjects WHERE tenant_id=$1", f.tenant).Scan(&count, &fastest, &gotForm, &gotFloor))
				require.Equal(t, int64(n), count)
				require.InDelta(t, gp, 1/float64(fastest), 1e-14)
				require.InDelta(t, gform, gotForm, 1e-14)
				require.InDelta(t, gfloor, gotFloor, 1e-14)
				require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT best_duration_ms FROM leaderboard_guild_"+kind+"_benchmarks WHERE tenant_id=$1", f.tenant).Scan(&benchmark))
				require.Equal(t, fastest, benchmark)
			}
			for _, who := range []string{"player", "guild"} {
				require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT kill_count FROM leaderboard_"+who+"_renown_counts WHERE tenant_id=$1", f.tenant).Scan(&count))
				require.Equal(t, int64(n), count)
			}
			for _, table := range []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"} {
				f.exec("DELETE FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant)
			}
			f.calculate()
			for _, table := range tables {
				require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT count(*) FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant).Scan(&count))
				require.Zero(t, count)
			}
		})
	}
}

func TestMaterializeReadFormulas(t *testing.T) {
	t.Parallel()
	for _, n := range []int{1, 2, 3} {
		t.Run(fmt.Sprint(n), func(t *testing.T) {
			t.Parallel()
			f := newMaterializeFixture(t)
			for range n {
				f.add(100, 1000, uuid.New())
			}
			f.calculate()
			// Versions deliberately differ: existing reads must not gate on metadata.
			f.exec(`UPDATE leaderboard_player_boss_benchmarks SET algorithm_version=99 WHERE tenant_id=$1`, f.tenant)
			p := database.ListLeaderboardV2Params{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, SubjectKind: "player", BoardKind: "boss", ScoreMetric: "mastery", PlayerClass: "MAGE", PlayerSpec: "Frost", Metric: "dps", Bosses: []string{"Boss"}, Awards: []float64{7}, Denominator: 1, PageSize: 50}
			rows, err := f.db.ListLeaderboardV2(f.ctx, p)
			require.NoError(t, err)
			require.Len(t, rows, 1)
			want := []float64{30, 80, 100}[n-1]
			require.InDelta(t, want, rows[0].Score, 1e-9)
			p.SubjectKind = "guild"
			p.PlayerClass = ""
			p.PlayerSpec = ""
			p.Metric = ""
			rows, err = f.db.ListLeaderboardV2(f.ctx, p)
			require.NoError(t, err)
			require.Len(t, rows, 1)
			require.InDelta(t, want, rows[0].Score, 1e-9)
			p.BoardKind = "clear"
			rows, err = f.db.ListLeaderboardV2(f.ctx, p)
			require.NoError(t, err)
			require.Len(t, rows, 1)
			require.InDelta(t, want, rows[0].Score, 1e-9)
			p.BoardKind = "renown"
			p.ScoreMetric = "renown"
			rows, err = f.db.ListLeaderboardV2(f.ctx, p)
			require.NoError(t, err)
			require.Len(t, rows, 1)
			require.InDelta(t, float64(n)*7, rows[0].Score, 1e-9)
			// Zero benchmark remains a real record and all performance scores are zero.
			f.exec(`UPDATE leaderboard_player_observations SET metric_value=0 WHERE tenant_id=$1`, f.tenant)
			f.calculate()
			p.SubjectKind = "player"
			p.BoardKind = "boss"
			p.ScoreMetric = "mastery"
			p.PlayerClass = "MAGE"
			p.PlayerSpec = "Frost"
			p.Metric = "dps"
			rows, err = f.db.ListLeaderboardV2(f.ctx, p)
			require.NoError(t, err)
			require.Len(t, rows, 1)
			require.Zero(t, rows[0].Score)
		})
	}
}

func TestMaterializeScopeIsolationAndCorrection(t *testing.T) {
	t.Parallel()
	f := newMaterializeFixture(t)
	f.add(100, 1000, uuid.New())
	// DPS and HPS for the SAME canonical run are distinct performance evidence,
	// but cannot multiply its metric-free kill fact.
	f.exec(`INSERT INTO leaderboard_player_observations SELECT (jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('metric','hps'))).* FROM leaderboard_player_observations o WHERE tenant_id=$1`, f.tenant)
	// Unrelated cohorts must not affect any exact result, even with larger metrics
	// or faster durations. Use the row type to keep fixture copies schema-exact.
	for _, table := range []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"} {
		changes := []string{`{"tenant_id":"00000000-0000-0000-0000-000000000099"}`, `{"instance_name":"Other raid"}`, `{"difficulty_name":"Other difficulty"}`, `{"max_players":25}`}
		if table != "guild_clear_observations" {
			changes = append(changes, `{"encounter_name":"Other boss"}`)
		}
		if table == "player_observations" {
			changes = append(changes, `{"player_class":"PRIEST"}`, `{"player_spec":"Arcane"}`, `{"player_sub_spec":"other"}`, `{"metric":"hps"}`)
		}
		where := "tenant_id=$1 AND instance_name='Test raid' AND difficulty_name='10 Player' AND max_players=10"
		if table != "guild_clear_observations" {
			where += " AND encounter_name='Boss'"
		}
		if table == "player_observations" {
			where += " AND player_class='MAGE' AND player_spec='Frost' AND player_sub_spec='' AND metric='dps'"
		}
		for _, change := range changes {
			f.exec("INSERT INTO leaderboard_"+table+" SELECT (jsonb_populate_record(NULL::leaderboard_"+table+",to_jsonb(o)||$2::jsonb||jsonb_build_object('run_id',gen_random_uuid(),'metric_value',99999,'duration_ms',1))).* FROM (SELECT * FROM leaderboard_"+table+" WHERE "+where+" LIMIT 1) o", f.tenant, change)
		}
	}
	f.calculate()
	var peak float64
	var count int64
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT raw_peak,observation_count FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak, &count))
	require.Equal(t, 100.0, peak)
	require.Equal(t, int64(1), count)
	for _, table := range []string{"player_renown_counts", "guild_renown_counts"} {
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT kill_count FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant).Scan(&count))
		require.Equal(t, int64(1), count)
	}
	for _, kind := range []string{"boss", "clear"} {
		var best int64
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT best_duration_ms FROM leaderboard_guild_"+kind+"_benchmarks WHERE tenant_id=$1", f.tenant).Scan(&best))
		require.Equal(t, int64(1000), best)
	}
	// A different realm is part of the same benchmark, but a different subject.
	f.exec(`INSERT INTO leaderboard_player_observations SELECT (jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('run_id',gen_random_uuid(),'realm_id',gen_random_uuid(),'metric_value',500))).* FROM (SELECT * FROM leaderboard_player_observations WHERE tenant_id=$1 AND player_class='MAGE' AND player_spec='Frost' AND player_sub_spec='' AND metric='dps' AND instance_name='Test raid' AND difficulty_name='10 Player' AND max_players=10 AND encounter_name='Boss' LIMIT 1) o`, f.tenant)
	f.calculate()
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT best_metric FROM leaderboard_player_boss_benchmarks WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 500.0, peak)
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT raw_peak FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 100.0, peak)
	f.exec(`DELETE FROM leaderboard_player_observations WHERE tenant_id=$1 AND metric_value=500`, f.tenant)
	f.calculate()
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT best_metric FROM leaderboard_player_boss_benchmarks WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 100.0, peak)
	// Spec changes move performance evidence; metric-free canonical kills do not
	// gain a second fact. Recalculating the old scope removes its stale subject.
	f.exec(`UPDATE leaderboard_player_observations SET player_spec='Moved' WHERE tenant_id=$1 AND realm_id=$2`, f.tenant, f.realm)
	f.calculate()
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT kill_count FROM leaderboard_player_renown_counts WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Equal(t, int64(1), count)
}

func TestMaterializePeakProvenance(t *testing.T) {
	t.Parallel()
	f := newMaterializeFixture(t)
	low := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	high := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	f.add(200, 8000, high)
	f.add(200, 1000, low)
	f.add(50, 500, uuid.New())
	user, server, group := uuid.New(), uuid.New(), uuid.New()
	f.exec(`INSERT INTO tenants(id,name) VALUES($1,'Provenance tenant')`, f.tenant)
	f.exec(`INSERT INTO users(id,username,email) VALUES($1,$2,$3)`, user, user.String(), user.String()+"@example.invalid")
	f.exec(`INSERT INTO wow_servers(id,name,tenant_id) VALUES($1,'Provenance server',$2)`, server, f.tenant)
	f.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Provenance realm')`, f.realm, server)
	f.exec(`INSERT INTO wow_log_groups(id,owner,created_at,updated_at) VALUES($1,$2,now(),now())`, group, user)
	f.exec(`INSERT INTO parsed_log_group(id) VALUES($1)`, group)
	f.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players,difficulty_normalized) SELECT source_instance_id,realm_id,$2,instance_name,difficulty_name,max_players,true FROM leaderboard_player_observations WHERE tenant_id=$1`, f.tenant, group)
	f.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) SELECT source_encounter_id,source_instance_id,encounter_name,'{}',true,'2026-01-01Z'::timestamptz,'2026-01-01Z'::timestamptz+CASE WHEN source_encounter_id=$2 THEN interval '8 seconds' ELSE interval '1 second' END,'clean' FROM leaderboard_player_observations WHERE tenant_id=$1`, f.tenant, low)
	check := func(valid bool) {
		t.Helper()
		f.calculate()
		var id uuid.NullUUID
		var duration *int64
		require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT peak_encounter_id,peak_duration_ms FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&id, &duration))
		require.Equal(t, valid, id.Valid)
		if valid {
			require.Equal(t, low, id.UUID)
			require.NotNil(t, duration)
			require.Equal(t, int64(8000), *duration)
		} else {
			require.Nil(t, duration)
		}
	}
	check(true) // peak tie selects smallest encounter UUID, not fastest duration
	f.exec(`UPDATE log_instance_encounters SET end_time=start_time WHERE id=$1`, low)
	check(false)
	f.exec(`UPDATE log_instance_encounters SET end_time=start_time+interval '8 seconds',name='Unrelated' WHERE id=$1`, low)
	check(false)
	f.exec(`UPDATE log_instance_encounters SET name='Boss' WHERE id=$1`, low)
	check(true)
	f.exec(`UPDATE wow_servers SET tenant_id=NULL WHERE id=$1`, server)
	check(false)
	f.exec(`UPDATE wow_servers SET tenant_id=$2 WHERE id=$1`, server, f.tenant)
	check(true)
	f.exec(`DELETE FROM log_instance_encounters WHERE id=$1`, low)
	check(false)
	// The greater UUID remains available but must never replace missing provenance.
	var peak float64
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT raw_peak FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 200.0, peak)
}

func TestMaterializeNonuniformReadsAndIndependentBenchmark(t *testing.T) {
	t.Parallel()
	f := newMaterializeFixture(t)
	f.add(20, 100, uuid.New())
	f.add(40, 200, uuid.New())
	f.add(100, 400, uuid.New())
	f.calculate()
	p := database.ListLeaderboardV2Params{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, SubjectKind: "player", BoardKind: "boss", ScoreMetric: "mastery", PlayerClass: "MAGE", PlayerSpec: "Frost", Metric: "dps", Bosses: []string{"Boss"}, Awards: []float64{7}, Denominator: 1, PageSize: 50}
	rows, err := f.db.ListLeaderboardV2(f.ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.InDelta(t, 54, rows[0].Score, 1e-10)
	p.SubjectKind = "guild"
	p.PlayerClass = ""
	p.PlayerSpec = ""
	p.Metric = ""
	rows, err = f.db.ListLeaderboardV2(f.ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.InDelta(t, 60, rows[0].Score, 1e-10)
	// Benchmark refresh alone does not rewrite or fan out raw subject summaries.
	var before, after []byte
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT to_jsonb(s) FROM leaderboard_player_boss_subjects s WHERE tenant_id=$1`, f.tenant).Scan(&before))
	f.exec(`INSERT INTO leaderboard_player_observations SELECT (jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('run_id',gen_random_uuid(),'player_guid','Other','metric_value',200))).* FROM (SELECT * FROM leaderboard_player_observations WHERE tenant_id=$1 ORDER BY run_id LIMIT 1) o`, f.tenant)
	require.NoError(t, f.db.MaterializeLeaderboardPlayerBossBenchmark(f.ctx, database.MaterializeLeaderboardPlayerBossBenchmarkParams{TenantID: f.tenant, InstanceName: "Test raid", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Boss", PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerSubSpec: "", Metric: "dps", ProjectionVersion: 9, AlgorithmVersion: 13}))
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT to_jsonb(s) FROM leaderboard_player_boss_subjects s WHERE tenant_id=$1`, f.tenant).Scan(&after))
	require.JSONEq(t, string(before), string(after))
	p.SubjectKind = "player"
	p.PlayerClass = "MAGE"
	p.PlayerSpec = "Frost"
	p.Metric = "dps"
	rows, err = f.db.ListLeaderboardV2(f.ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.InDelta(t, 27, rows[0].Score, 1e-10)
	// Removing the record recomputes max; removing the old subject's peak repairs
	// bands from the full remaining history, not incremental partial averages.
	f.exec(`DELETE FROM leaderboard_player_observations WHERE tenant_id=$1 AND (player_guid='Other' OR metric_value=100)`, f.tenant)
	f.calculate()
	rows, err = f.db.ListLeaderboardV2(f.ctx, p)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.InDelta(t, 55, rows[0].Score, 1e-10)
}

func TestMaterializeIndexMigration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "RESET ROLE")
	require.NoError(t, err)
	for _, direction := range []string{"down", "up"} {
		script, err := os.ReadFile("migrations/000348_leaderboard_evidence_benchmarks." + direction + ".sql")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, string(script))
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, "SET ROLE chronicle")
	require.NoError(t, err)
}

func TestMaterializeGuildRealmIsolationAndRecordRemoval(t *testing.T) {
	t.Parallel()
	f := newMaterializeFixture(t)
	f.add(20, 100, uuid.New())
	f.add(40, 200, uuid.New())
	f.add(100, 400, uuid.New())
	for _, table := range []string{"guild_boss_observations", "guild_clear_observations", "guild_renown_facts", "player_renown_facts"} {
		// Another realm changes the shared duration benchmark, not this subject's
		// history/count.
		f.exec("INSERT INTO leaderboard_"+table+" SELECT (jsonb_populate_record(NULL::leaderboard_"+table+",to_jsonb(o)||jsonb_build_object('run_id',gen_random_uuid(),'realm_id',gen_random_uuid(),'duration_ms',50))).* FROM (SELECT * FROM leaderboard_"+table+" WHERE tenant_id=$1 ORDER BY run_id LIMIT 1) o", f.tenant)
	}
	f.calculate()
	var best, fastest, count int64
	for _, kind := range []string{"boss", "clear"} {
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT best_duration_ms FROM leaderboard_guild_"+kind+"_benchmarks WHERE tenant_id=$1", f.tenant).Scan(&best))
		require.Equal(t, int64(50), best)
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT fastest_duration_ms,observation_count FROM leaderboard_guild_"+kind+"_subjects WHERE tenant_id=$1", f.tenant).Scan(&fastest, &count))
		require.Equal(t, int64(100), fastest)
		require.Equal(t, int64(3), count)
		f.exec("DELETE FROM leaderboard_guild_"+kind+"_observations WHERE tenant_id=$1 AND duration_ms<=100", f.tenant)
	}
	for _, who := range []string{"guild", "player"} {
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT kill_count FROM leaderboard_"+who+"_renown_counts WHERE tenant_id=$1", f.tenant).Scan(&count))
		require.Equal(t, int64(3), count)
	}
	f.calculate()
	for _, kind := range []string{"boss", "clear"} {
		var form, floor float64
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT best_duration_ms FROM leaderboard_guild_"+kind+"_benchmarks WHERE tenant_id=$1", f.tenant).Scan(&best))
		require.Equal(t, int64(200), best)
		require.NoError(t, f.conn.QueryRow(f.ctx, "SELECT fastest_duration_ms,observation_count,form_mean_inverse_ms,floor_mean_inverse_ms FROM leaderboard_guild_"+kind+"_subjects WHERE tenant_id=$1", f.tenant).Scan(&fastest, &count, &form, &floor))
		require.Equal(t, int64(200), fastest)
		require.Equal(t, int64(2), count)
		require.InDelta(t, 1.0/400, form, 1e-14)
		require.Zero(t, floor)
	}
}

func TestMaterializeCompleteLargeHistory(t *testing.T) {
	t.Parallel()
	f := newMaterializeFixture(t)
	f.add(0, 1000, uuid.New())
	f.exec(`INSERT INTO leaderboard_player_observations
 SELECT (jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('run_id',gen_random_uuid(),'metric_value',g::double precision))).*
 FROM (SELECT * FROM leaderboard_player_observations WHERE tenant_id=$1) o CROSS JOIN generate_series(1,9999) g`, f.tenant)
	f.calculate()
	history := make([]float64, 10000)
	for i := range history {
		history[i] = float64(i)
	}
	peak, form, floor := rawOracle(history)
	var gotPeak, gotForm, gotFloor float64
	var count int64
	require.NoError(t, f.conn.QueryRow(f.ctx, `SELECT observation_count,raw_peak,raw_form,raw_floor FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count, &gotPeak, &gotForm, &gotFloor))
	require.Equal(t, int64(10000), count)
	require.Equal(t, peak, gotPeak)
	require.Equal(t, form, gotForm)
	require.Equal(t, floor, gotFloor)
}
