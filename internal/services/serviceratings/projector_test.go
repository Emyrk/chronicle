package serviceratings

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"os"
	"testing"
	"time"
)

type sourceFixture struct {
	*fixture
	run, instance, encounter, group, server uuid.UUID
}

func newSourceFixture(t *testing.T) *sourceFixture {
	t.Helper()
	f := newFixture(t)
	s := &sourceFixture{fixture: f, run: uuid.New(), instance: uuid.New(), encounter: uuid.New(), group: uuid.New(), server: uuid.New()}
	user := uuid.New()
	f.exec(`INSERT INTO tenants(id,name) VALUES($1,'Projection tenant')`, f.tenant)
	f.exec(`INSERT INTO users(id,username,email) VALUES($1,$2,$3)`, user, user.String(), user.String()+"@example.invalid")
	f.exec(`INSERT INTO wow_servers(id,name,tenant_id) VALUES($1,'Projection server',$2)`, s.server, f.tenant)
	f.exec(`INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,'Projection realm')`, f.realm, s.server)
	f.exec(`INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,'Projection guild')`, f.guild, f.realm)
	f.exec(`INSERT INTO wow_log_groups(id,owner,created_at,updated_at) VALUES($1,$2,now(),now())`, s.group, user)
	f.exec(`INSERT INTO parsed_log_group(id) VALUES($1)`, s.group)
	// A duplicate-group identity distinct from the representative is valid only
	// when the group ID references another existing instance (seed it first).
	s.run = s.instance
	f.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players,guild_id) VALUES($1,$2,$3,'Fixture raid','Normal',40,$4)`, s.instance, f.realm, s.group, f.guild)
	f.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) VALUES($1,$2,'Boss','{}',true,'2026-01-01Z','2026-01-01Z'::timestamptz+interval '10 seconds','clean')`, s.encounter, s.instance)
	f.exec(`INSERT INTO ranking_runs(run_id,representative_instance_id,realm_id,instance_name,difficulty_name,max_players,boss_coverage,member_count,source_updated_at) VALUES($1,$2,$3,'Fixture raid','Normal',40,1,1,now())`, s.run, s.instance, f.realm)
	f.exec(`INSERT INTO encounter_dps_rankings(encounter_id,instance_id,encounter_name,instance_name,player_guid,player_name,player_class,player_spec,difficulty_name,max_players,realm_id,realm_name,damage_done,duration_secs,dps,hps,killed_at) VALUES($1,$2,'Boss','Fixture raid','Player','Player','MAGE','Frost','Normal',40,$3,'Projection realm',1000,10,100,25,now())`, s.encounter, s.instance, f.realm)
	return s
}
func (s *sourceFixture) times() {
	s.t.Helper()
	id := uuid.New()
	row := map[string]any{"id": id, "tenant_id": s.tenant, "instance_id": s.instance, "run_id": s.run, "log_group_id": s.group, "realm_id": s.realm, "guild_id": s.guild, "clear_duration_ms": 10000, "cutoff": "2026-01-01Z", "window_start": "2025-01-01Z", "lookback_days": 365, "policy_version": 1, "query_version": 1, "computed_at": "2026-01-01Z"}
	for _, prefix := range []string{"clear_server", "clear_realm", "clear_guild"} {
		row[prefix+"_precise_score"] = 99
		row[prefix+"_display_score"] = 99
		row[prefix+"_rank"] = 1
		row[prefix+"_sample_size"] = 1
		row[prefix+"_status"] = "ranked"
	}
	data, err := json.Marshal(row)
	require.NoError(s.t, err)
	s.exec(`INSERT INTO time_parse_scores SELECT(jsonb_populate_record(NULL::time_parse_scores,$1::jsonb)).*`, string(data))
	row = map[string]any{"time_parse_score_id": id, "encounter_id": s.encounter, "encounter_name": "Boss", "duration_ms": 10000}
	for _, prefix := range []string{"server", "realm"} {
		row[prefix+"_precise_score"] = 99
		row[prefix+"_display_score"] = 99
		row[prefix+"_rank"] = 1
		row[prefix+"_sample_size"] = 1
		row[prefix+"_status"] = "ranked"
	}
	data, err = json.Marshal(row)
	require.NoError(s.t, err)
	s.exec(`INSERT INTO time_parse_boss_scores SELECT(jsonb_populate_record(NULL::time_parse_boss_scores,$1::jsonb)).*`, string(data))
}
func (s *sourceFixture) compute() []database.ProjectLeaderboardRunRow {
	s.t.Helper()
	rows, err := ComputeProjection(s.tenantctx(), s.db, s.tenant, s.run)
	require.NoError(s.t, err)
	return rows
}
func (s *sourceFixture) enqueueRun() {
	s.t.Helper()
	require.NoError(s.t, s.db.EnqueueLeaderboardRun(s.tenantctx(), database.EnqueueLeaderboardRunParams{TenantID: s.tenant, RunID: s.run, ProcessAfter: database.Timestamptz(time.Now().Add(-time.Minute))}))
}
func (s *sourceFixture) claim() database.LeaderboardDirtyRun {
	s.t.Helper()
	rows, err := s.db.ClaimLeaderboardRun(s.tenantctx(), s.tenant)
	require.NoError(s.t, err)
	require.Len(s.t, rows, 1)
	return rows[0]
}
func (s *sourceFixture) direct(rows []database.ProjectLeaderboardRunRow) error {
	return s.db.InTx(s.tenantctx(), func(tx database.Store) error {
		created, err := tx.LockLeaderboardDirectPublication(s.tenantctx(), database.LockLeaderboardDirectPublicationParams{TenantID: s.tenant, RunID: s.run})
		if err != nil {
			return err
		}
		if err := PublishProjectionTx(s.tenantctx(), tx, s.tenant, s.run, rows); err != nil {
			return err
		}
		if created {
			return tx.RemoveLeaderboardDirectPlaceholder(s.tenantctx(), database.RemoveLeaderboardDirectPlaceholderParams{TenantID: s.tenant, RunID: s.run})
		}
		return nil
	}, nil)
}
func TestProjectionFamiliesAndReplay(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	rows := s.compute()
	require.Len(t, rows, 4) // DPS,HPS, metric-free player/guild kills despite missing times.
	s.times()
	rows = s.compute()
	require.Len(t, rows, 6)
	require.NoError(t, s.direct(rows))
	require.NoError(t, s.direct(rows))
	for table, want := range map[string]int{"player_observations": 2, "guild_boss_observations": 1, "guild_clear_observations": 1, "player_renown_facts": 1, "guild_renown_facts": 1} {
		var n int
		require.NoError(t, s.row("SELECT count(*) FROM leaderboard_"+table+" WHERE tenant_id=$1", s.tenant).Scan(&n))
		require.Equal(t, want, n)
	}
	// No mandatory D1 queue hop on normal direct publication.
	var n int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&n))
	require.Zero(t, n)
	// Exercise explicit D1 repair before materializing and reading the results.
	s.enqueueRun()
	processed, err := (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, processed)
	for _, family := range []Family{FamilyPlayerBossBenchmark, FamilyPlayerBossSubject, FamilyGuildBossBenchmark, FamilyGuildBossSubject, FamilyGuildClearBenchmark, FamilyGuildClearSubject, FamilyPlayerRenownCount, FamilyGuildRenownCount} {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, family)
		require.NoError(t, err)
	}
	var peak float64
	var encounter uuid.UUID
	var duration int64
	require.NoError(t, s.row(`SELECT raw_peak,peak_encounter_id,peak_duration_ms FROM leaderboard_player_boss_subjects WHERE tenant_id=$1 AND metric='dps'`, s.tenant).Scan(&peak, &encounter, &duration))
	require.Equal(t, 100.0, peak)
	require.Equal(t, s.encounter, encounter)
	require.Equal(t, int64(10000), duration)
	require.NoError(t, s.row(`SELECT kill_count FROM leaderboard_player_renown_counts WHERE tenant_id=$1`, s.tenant).Scan(&n))
	require.Equal(t, 1, n)
	read, err := s.db.ListLeaderboardV2(s.tenantctx(), database.ListLeaderboardV2Params{TenantID: s.tenant, SubjectKind: "player", BoardKind: "boss", InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, Bosses: []string{"Boss"}, PlayerClass: "MAGE", PlayerSpec: "Frost", Metric: "dps", Denominator: 1, ScoreMetric: "peak", PageSize: 10})
	require.NoError(t, err)
	require.Len(t, read, 1)
}
func TestRepairStaleOwnedPublicationConverges(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	claim := s.claim()
	a := s.compute()
	// Model the FUTURE direct-writer transaction: serialize before source changes,
	// bump the overlapping revision without replacing its owner's token.
	require.NoError(t, s.db.InTx(s.tenantctx(), func(tx database.Store) error {
		_, err := tx.LockLeaderboardDirectPublication(s.tenantctx(), database.LockLeaderboardDirectPublicationParams{TenantID: s.tenant, RunID: s.run})
		if err != nil {
			return err
		}
		raw, ok := database.PGXTx(tx)
		if !ok {
			return errors.New("expected transaction")
		}
		if _, err := raw.Exec(s.tenantctx(), `UPDATE encounter_dps_rankings SET player_spec='Fire',dps=200,hps=200 WHERE instance_id=$1`, s.instance); err != nil {
			return err
		}

		b := append([]database.ProjectLeaderboardRunRow(nil), a...)
		for i := range b {
			if b[i].Kind == 1 {
				b[i].PlayerSpec = "Fire"
				b[i].MetricValue = 200
			}
		}
		return PublishProjectionTx(s.tenantctx(), tx, s.tenant, s.run, b)
	}, nil))
	w := RepairWorker{Store: s.db}
	require.NoError(t, w.publish(s.tenantctx(), claim, a))
	var rev int64
	var token uuid.NullUUID
	require.NoError(t, s.row(`SELECT revision,claim_token FROM leaderboard_dirty_runs WHERE tenant_id=$1 AND run_id=$2`, s.tenant, s.run).Scan(&rev, &token))
	require.Equal(t, int64(2), rev)
	require.False(t, token.Valid)
	var specs int
	require.NoError(t, s.row(`SELECT count(DISTINCT player_spec) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&specs))
	require.Equal(t, 2, specs) // publication-time OLD Fire + stale NEW Frost.
	processed, err := w.Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, processed)
	var spec string
	require.NoError(t, s.row(`SELECT player_spec FROM leaderboard_player_observations WHERE tenant_id=$1 AND metric='dps'`, s.tenant).Scan(&spec))
	require.Equal(t, "Fire", spec)
	require.NoError(t, w.publish(s.tenantctx(), claim, nil)) // stale token may not erase B.
	require.NoError(t, s.row(`SELECT player_spec FROM leaderboard_player_observations WHERE tenant_id=$1 AND metric='dps'`, s.tenant).Scan(&spec))
	require.Equal(t, "Fire", spec)
}

func TestProjectionEligibilityAndRollback(t *testing.T) {
	t.Parallel()
	for _, scenario := range []string{"unlisted", "invalidated", "wrong_realm", "wrong_variant", "missing_run", "deleted_source", "wrong_guild"} {
		t.Run(scenario, func(t *testing.T) {
			t.Parallel()
			s := newSourceFixture(t)
			s.times()
			original := s.compute()
			require.NoError(t, s.direct(original))
			switch scenario {
			case "unlisted":
				s.exec(`UPDATE wow_log_groups SET unlisted=true WHERE id=$1`, s.group)
			case "invalidated":
				s.exec(`UPDATE log_instances SET invalidated_at=now() WHERE id=$1`, s.instance)
			case "wrong_realm":
				s.exec(`UPDATE encounter_dps_rankings SET realm_id=(SELECT id FROM wow_server_realms WHERE id<>$1 LIMIT 1) WHERE instance_id=$2`, s.realm, s.instance)
			case "wrong_variant":
				s.exec(`UPDATE encounter_dps_rankings SET difficulty_name='Wrong' WHERE instance_id=$1`, s.instance)
			case "missing_run":
				s.exec(`DELETE FROM ranking_runs WHERE run_id=$1`, s.run)
			case "deleted_source":
				s.exec(`DELETE FROM log_instances WHERE id=$1`, s.instance)
			case "wrong_guild":
				s.exec(`UPDATE log_instances SET guild_id=NULL WHERE id=$1`, s.instance)
			}
			rows := s.compute()
			switch scenario {
			case "wrong_guild", "wrong_realm", "wrong_variant":
				require.Len(t, rows, 3)
			default:
				require.Empty(t, rows)
			}
			// Inject failure AFTER old/new scope fanout and evidence replacement.
			sentinel := errors.New("injected rollback")
			err := s.db.InTx(s.tenantctx(), func(tx database.Store) error {
				if err := PublishProjectionTx(s.tenantctx(), tx, s.tenant, s.run, rows); err != nil {
					return err
				}
				return sentinel
			}, nil)
			require.ErrorIs(t, err, sentinel)
			var n int
			require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&n))
			require.Equal(t, 2, n)
			require.NoError(t, s.direct(rows))
		})
	}
}

func TestRepairDeletionAfterCaptureAndExpiry(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	old := s.claim()
	a := s.compute()
	w := RepairWorker{Store: s.db}
	s.exec(`UPDATE leaderboard_dirty_runs SET locked_until=clock_timestamp()-interval '1 second' WHERE tenant_id=$1`, s.tenant)
	require.NoError(t, w.publish(s.tenantctx(), old, a))
	var n int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&n))
	require.Zero(t, n)
	next := s.claim()
	require.NotEqual(t, old.ClaimToken, next.ClaimToken)
	s.enqueueRun()
	s.exec(`DELETE FROM log_instances WHERE id=$1`, s.instance)
	require.NoError(t, w.publish(s.tenantctx(), next, a)) // accepted stale snapshot, pending obligation survives.
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&n))
	require.Equal(t, 2, n)
	_, err := w.Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&n))
	require.Zero(t, n)
}

func TestProjectionTenantMovementAndCanonicalMergeUnlink(t *testing.T) {
	t.Parallel()
	t.Run("tenant movement", func(t *testing.T) {
		t.Parallel()
		s := newSourceFixture(t)
		oldTenant := s.tenant
		require.NoError(t, s.direct(s.compute()))
		newTenant := uuid.New()
		s.exec(`INSERT INTO tenants(id,name) VALUES($1,'Moved tenant')`, newTenant)
		s.exec(`UPDATE wow_servers SET tenant_id=$1 WHERE id=$2`, newTenant, s.server)
		require.Empty(t, s.compute()) // old tenant cannot read the new tenant's sources.
		s.enqueueRun()
		_, err := (&RepairWorker{Store: s.db}).Drain(s.ctx, oldTenant)
		require.NoError(t, err)
		var count int
		require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, oldTenant).Scan(&count))
		require.Zero(t, count)
		s.tenant = newTenant
		rows := s.compute()
		require.Len(t, rows, 4)
		require.NoError(t, s.direct(rows))
		require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, oldTenant).Scan(&count))
		require.Equal(t, 2, count)
		require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, newTenant).Scan(&count))
		require.Equal(t, 2, count)
	})
	t.Run("merge and unlink", func(t *testing.T) {
		t.Parallel()
		s := newSourceFixture(t)
		oldRun := s.run
		require.NoError(t, s.direct(s.compute()))
		merged := uuid.New()
		s.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players) VALUES($1,$2,$3,'Fixture raid','Normal',40)`, merged, s.realm, s.group)
		s.exec(`UPDATE log_instances SET duplicate_group_id=$1 WHERE id=$2`, merged, s.instance)
		s.exec(`UPDATE ranking_runs SET run_id=$1 WHERE run_id=$2`, merged, oldRun)
		s.enqueueRun()
		_, err := (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
		require.NoError(t, err)
		require.Empty(t, s.compute())
		s.run = merged
		require.NoError(t, s.direct(s.compute()))
		var count int
		require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1 AND run_id=$2`, s.tenant, merged).Scan(&count))
		require.Equal(t, 2, count)
		s.exec(`UPDATE log_instances SET duplicate_group_id=NULL WHERE id=$1`, s.instance)
		s.exec(`UPDATE ranking_runs SET run_id=$1 WHERE run_id=$2`, oldRun, merged)
		s.enqueueRun()
		_, err = (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
		require.NoError(t, err)
		s.run = oldRun
		require.NoError(t, s.direct(s.compute()))
		require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_renown_facts WHERE tenant_id=$1`, s.tenant).Scan(&count))
		require.Equal(t, 1, count)
	})
}

func TestRepairClaimsAndDispatchBounded(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	c := s.claim()
	rows, err := s.db.ClaimLeaderboardRun(s.tenantctx(), s.tenant)
	require.NoError(t, err)
	require.Empty(t, rows)
	require.NoError(t, s.db.RetryLeaderboardRun(s.tenantctx(), database.RetryLeaderboardRunParams{TenantID: s.tenant, RunID: s.run, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}))
	s.enqueueRun()
	rows, err = s.db.ClaimLeaderboardRun(s.tenantctx(), s.tenant)
	require.NoError(t, err)
	require.Empty(t, rows)
	queue := &recordingQueue{}
	dispatcher := RepairDispatcher{Store: s.db, Queue: queue}
	require.NoError(t, dispatcher.dispatch(s.ctx, ArgsRepairDispatch{}))
	require.Empty(t, queue.jobs)
	for range 101 {
		tenant := uuid.New()
		s.exec(`INSERT INTO leaderboard_dirty_runs(tenant_id,run_id) VALUES($1,$2)`, tenant, uuid.New())
	}
	require.NoError(t, dispatcher.dispatch(s.ctx, ArgsRepairDispatch{}))
	require.Len(t, queue.jobs, 101)
	cursor, ok := queue.jobs[100].(ArgsRepairDispatch)
	require.True(t, ok)
	queue.jobs = nil
	require.NoError(t, dispatcher.dispatch(s.ctx, cursor))
	require.Len(t, queue.jobs, 1)
}

// Pause after the one-statement snapshot has been read, before publication.
// A real concurrent producer must complete without waiting for D1 computation.
type pausedProjectionStore struct {
	database.Store
	captured chan struct{}
	release  chan struct{}
}

func (p *pausedProjectionStore) ProjectLeaderboardRun(ctx context.Context, args database.ProjectLeaderboardRunParams) ([]database.ProjectLeaderboardRunRow, error) {
	rows, err := p.Store.ProjectLeaderboardRun(ctx, args)
	if err != nil {
		return nil, err
	}
	close(p.captured)
	select {
	case <-p.release:
		return rows, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}
func TestRepairProducerProgressDuringProjection(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	wrapped := &pausedProjectionStore{Store: s.db, captured: make(chan struct{}), release: make(chan struct{})}
	done := make(chan error, 1)
	go func() { _, err := (&RepairWorker{Store: wrapped}).Drain(s.ctx, s.tenant); done <- err }()
	select {
	case <-wrapped.captured:
	case <-s.ctx.Done():
		t.Fatal(s.ctx.Err())
	}
	defer func() { close(wrapped.release); require.NoError(t, <-done) }()
	start := time.Now()
	require.NoError(t, s.direct(s.compute()))
	t.Logf("direct producer during paused D1: %s", time.Since(start))
	var revision int64
	require.NoError(t, s.row(`SELECT revision FROM leaderboard_dirty_runs WHERE tenant_id=$1 AND run_id=$2`, s.tenant, s.run).Scan(&revision))
	require.Equal(t, int64(2), revision)
}

func TestMeasureRunProjection(t *testing.T) {
	if os.Getenv("CHRONICLE_MEASURE_D1") != "1" {
		t.Skip("opt-in dedicated local raid projection measurement")
	}
	t.Parallel()
	s := newSourceFixture(t)
	s.times()
	var sample []byte
	require.NoError(t, s.row(`SELECT to_jsonb(d) FROM encounter_dps_rankings d WHERE instance_id=$1`, s.instance).Scan(&sample))
	s.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) SELECT gen_random_uuid(),$1,'Boss'||g,'{}',true,'2026-01-01Z','2026-01-01Z'::timestamptz+interval '10 seconds','clean' FROM generate_series(1,11) g`, s.instance)
	s.exec(`DELETE FROM encounter_dps_rankings WHERE instance_id=$1`, s.instance)
	s.exec(`INSERT INTO encounter_dps_rankings SELECT(jsonb_populate_record(NULL::encounter_dps_rankings,$2::jsonb||jsonb_build_object('id',gen_random_uuid(),'encounter_id',e.id,'encounter_name',e.name,'player_guid','Player'||g))).* FROM log_instance_encounters e CROSS JOIN generate_series(1,40) g WHERE e.instance_id=$1`, s.instance, string(sample))
	var bossSample []byte
	require.NoError(t, s.row(`SELECT to_jsonb(b) FROM time_parse_boss_scores b WHERE encounter_id=$1`, s.encounter).Scan(&bossSample))
	s.exec(`INSERT INTO time_parse_boss_scores SELECT(jsonb_populate_record(NULL::time_parse_boss_scores,$2::jsonb||jsonb_build_object('encounter_id',e.id,'encounter_name',e.name))).* FROM log_instance_encounters e WHERE e.instance_id=$1 AND e.id<>$3`, s.instance, string(bossSample), s.encounter)
	for i := range 7 {
		start := time.Now()
		rows := s.compute()
		compute := time.Since(start)
		require.Len(t, rows, 1465)
		start = time.Now()
		require.NoError(t, s.direct(rows))
		publish := time.Since(start)
		t.Logf("sample=%d rows=%d compute_ms=%.3f publication_ms=%.3f", i, len(rows), float64(compute.Microseconds())/1000, float64(publish.Microseconds())/1000)
	}
}

func TestProjectionRepresentativeReplacementAndGuildMove(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.times()
	require.NoError(t, s.direct(s.compute()))
	next, encounter, newGuild := uuid.New(), uuid.New(), uuid.New()
	s.exec(`INSERT INTO guilds(id,realm_id,name) VALUES($1,$2,'New guild')`, newGuild, s.realm)
	s.exec(`INSERT INTO log_instances(id,realm_id,log_group_id,name,difficulty_name,max_players,guild_id,duplicate_group_id) VALUES($1,$2,$3,'Fixture raid','Normal',40,$4,$5)`, next, s.realm, s.group, newGuild, s.run)
	s.exec(`INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) VALUES($1,$2,'Boss','{}',true,'2026-01-01Z','2026-01-01Z'::timestamptz+interval '10 seconds','clean')`, encounter, next)
	s.exec(`INSERT INTO encounter_dps_rankings SELECT(jsonb_populate_record(NULL::encounter_dps_rankings,to_jsonb(d)||jsonb_build_object('id',gen_random_uuid(),'instance_id',$2::uuid,'encounter_id',$3::uuid,'dps',300))).* FROM encounter_dps_rankings d WHERE instance_id=$1`, s.instance, next, encounter)
	s.exec(`UPDATE ranking_runs SET representative_instance_id=$1 WHERE run_id=$2`, next, s.run)
	s.enqueueRun()
	_, err := (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	var source uuid.UUID
	require.NoError(t, s.row(`SELECT source_instance_id FROM leaderboard_player_observations WHERE tenant_id=$1 AND metric='dps'`, s.tenant).Scan(&source))
	require.Equal(t, next, source)
	var guild uuid.UUID
	require.NoError(t, s.row(`SELECT guild_id FROM leaderboard_guild_renown_facts WHERE tenant_id=$1`, s.tenant).Scan(&guild))
	require.Equal(t, newGuild, guild)
	var count int
	require.NoError(t, s.row(`SELECT count(DISTINCT guild_id) FROM leaderboard_dirty_guild_renown WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 2, count)
	// Missing new representative duration stage cannot retain the old guild scores.
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_guild_boss_observations WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
	// Deleting the OLD representative does not delete the replacement evidence.
	s.exec(`UPDATE log_instances SET duplicate_group_id=NULL WHERE id=$1`, next)
	s.exec(`UPDATE ranking_runs SET run_id=$1 WHERE run_id=$2`, next, s.run)
	s.exec(`DELETE FROM log_instances WHERE id=$1`, s.instance)
	s.enqueueRun()
	_, err = (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	s.run = next
	require.NoError(t, s.direct(s.compute()))
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_renown_facts WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 1, count)
}

type failEvidenceReplacement struct{ database.StoreQueries }

func (f failEvidenceReplacement) DeleteLeaderboardRunEvidence(context.Context, database.DeleteLeaderboardRunEvidenceParams) error {
	return errors.New("injected before evidence replacement")
}
func TestProjectionRollbackBetweenObligationAndReplacement(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	var before int64
	require.NoError(t, s.row(`SELECT sum(revision) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&before))
	err := s.db.InTx(s.tenantctx(), func(tx database.Store) error {
		return PublishProjectionTx(s.tenantctx(), failEvidenceReplacement{tx}, s.tenant, s.run, nil)
	}, nil)
	require.ErrorContains(t, err, "injected before evidence replacement")
	var after int64
	require.NoError(t, s.row(`SELECT sum(revision) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&after))
	require.Equal(t, before, after)
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 2, count)
}
func TestRepairCancellationReleasesWithBackoff(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	wrapped := &pausedProjectionStore{Store: s.db, captured: make(chan struct{}), release: make(chan struct{})}
	ctx, cancel := context.WithCancel(s.ctx)
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := (&RepairWorker{Store: wrapped}).Drain(ctx, s.tenant); done <- err }()
	select {
	case <-wrapped.captured:
	case <-s.ctx.Done():
		t.Fatal(s.ctx.Err())
	}
	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
	var token uuid.NullUUID
	var attempts int
	var backoff bool
	require.NoError(t, s.row(`SELECT claim_token,attempts,retry_after>clock_timestamp() FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&token, &attempts, &backoff))
	require.False(t, token.Valid)
	require.Equal(t, 1, attempts)
	require.True(t, backoff)
}
