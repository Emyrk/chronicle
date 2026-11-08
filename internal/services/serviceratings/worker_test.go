package serviceratings

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

// Install production tenant pool hooks once, before parallel tests start.
func TestMain(m *testing.M) {
	database.PrepareConnFunc = servicetenant.PrepareConn
	database.ResetConnFunc = servicetenant.ResetConn
	database.CheckNestedTxFunc = servicetenant.CheckNestedTx
	os.Exit(m.Run())
}

type fixture struct {
	t                    *testing.T
	ctx                  context.Context
	pool                 *pgxpool.Pool
	db                   database.Store
	tenant, realm, guild uuid.UUID
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitSuperLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	return &fixture{t, ctx, pool, database.New(pool), uuid.New(), uuid.New(), uuid.New()}
}
func (f *fixture) exec(q string, args ...any) {
	f.t.Helper()
	_, err := f.pool.Exec(servicetenant.AdminBypass(f.ctx), q, args...)
	require.NoError(f.t, err)
}
func (f *fixture) row(q string, args ...any) interface{ Scan(...any) error } {
	return f.pool.QueryRow(servicetenant.AdminBypass(f.ctx), q, args...)
}
func (f *fixture) tenantctx() context.Context { return servicetenant.WithTenantID(f.ctx, f.tenant) }
func (f *fixture) evidence(boss string) {
	f.t.Helper()
	row := map[string]any{"tenant_id": f.tenant, "realm_id": f.realm, "guild_id": f.guild, "instance_name": "Fixture raid", "difficulty_name": "Normal", "max_players": 40, "encounter_name": boss, "player_guid": "Player", "player_class": "MAGE", "player_spec": "Frost", "player_sub_spec": "", "metric": "dps", "metric_value": 100, "duration_ms": 1000, "run_id": uuid.New(), "source_instance_id": uuid.New(), "source_encounter_id": uuid.New(), "source_ranking_id": uuid.New(), "source_time_parse_score_id": uuid.New(), "projection_version": 1, "observed_at": "2026-01-01T00:00:00Z"}
	data, err := json.Marshal(row)
	require.NoError(f.t, err)
	for _, table := range []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"} {
		f.exec("INSERT INTO leaderboard_"+table+" SELECT (jsonb_populate_record(NULL::leaderboard_"+table+",$1::jsonb)).*", string(data))
	}
}
func (f *fixture) enqueue(family Family, boss string, due time.Time) {
	f.t.Helper()
	ctx := f.tenantctx()
	switch family {
	case FamilyPlayerBossBenchmark:
		require.NoError(f.t, f.db.EnqueueLeaderboardPlayerBossBenchmark(ctx, database.EnqueueLeaderboardPlayerBossBenchmarkParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerSubSpec: "", Metric: "dps", ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyPlayerBossSubject:
		require.NoError(f.t, f.db.EnqueueLeaderboardPlayerBossSubject(ctx, database.EnqueueLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, PlayerClass: "MAGE", PlayerSpec: "Frost", PlayerSubSpec: "", Metric: "dps", RealmID: f.realm, PlayerGuid: "Player", ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyGuildBossBenchmark:
		require.NoError(f.t, f.db.EnqueueLeaderboardGuildBossBenchmark(ctx, database.EnqueueLeaderboardGuildBossBenchmarkParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyGuildBossSubject:
		require.NoError(f.t, f.db.EnqueueLeaderboardGuildBossSubject(ctx, database.EnqueueLeaderboardGuildBossSubjectParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, RealmID: f.realm, GuildID: f.guild, ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyGuildClearBenchmark:
		require.NoError(f.t, f.db.EnqueueLeaderboardGuildClearBenchmark(ctx, database.EnqueueLeaderboardGuildClearBenchmarkParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyGuildClearSubject:
		require.NoError(f.t, f.db.EnqueueLeaderboardGuildClearSubject(ctx, database.EnqueueLeaderboardGuildClearSubjectParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, RealmID: f.realm, GuildID: f.guild, ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyPlayerRenownCount:
		require.NoError(f.t, f.db.EnqueueLeaderboardPlayerRenownCount(ctx, database.EnqueueLeaderboardPlayerRenownCountParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, RealmID: f.realm, PlayerGuid: "Player", ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	case FamilyGuildRenownCount:
		require.NoError(f.t, f.db.EnqueueLeaderboardGuildRenownCount(ctx, database.EnqueueLeaderboardGuildRenownCountParams{TenantID: f.tenant, InstanceName: "Fixture raid", DifficultyName: "Normal", MaxPlayers: 40, EncounterName: boss, RealmID: f.realm, GuildID: f.guild, ProcessAfter: pgtype.Timestamptz{Time: due, Valid: true}}))
	default:
		f.t.Fatal("bad family")
	}
}

var dirtyTables = []string{
	"leaderboard_dirty_player_boss_benchmarks",
	"leaderboard_dirty_player_boss_subjects",
	"leaderboard_dirty_guild_boss_benchmarks",
	"leaderboard_dirty_guild_boss_subjects",
	"leaderboard_dirty_guild_clear_benchmarks",
	"leaderboard_dirty_guild_clear_subjects",
	"leaderboard_dirty_player_renown",
	"leaderboard_dirty_guild_renown",
}
var resultTables = []string{
	"leaderboard_player_boss_benchmarks",
	"leaderboard_player_boss_subjects",
	"leaderboard_guild_boss_benchmarks",
	"leaderboard_guild_boss_subjects",
	"leaderboard_guild_clear_benchmarks",
	"leaderboard_guild_clear_subjects",
	"leaderboard_player_renown_counts",
	"leaderboard_guild_renown_counts",
}

func TestAllFamiliesDrainAndNonSlidingEnqueue(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	due := time.Now().Add(-time.Minute)
	for family := Family(0); family < familyCount; family++ {
		f.enqueue(family, "Boss", due)
		f.enqueue(family, "Boss", due.Add(time.Hour))
		var revision int64
		var gotDue time.Time
		require.NoError(t, f.row("SELECT revision,process_after FROM "+dirtyTables[family]+" WHERE tenant_id=$1", f.tenant).Scan(&revision, &gotDue))
		require.Equal(t, int64(2), revision)
		require.WithinDuration(t, due, gotDue, time.Microsecond)
		result, err := (&Worker{Store: f.db}).Drain(f.ctx, f.tenant, family)
		require.NoError(t, err)
		require.Equal(t, 1, result.Claimed)
		require.Equal(t, 1, result.Processed)
		var count int
		require.NoError(t, f.row("SELECT count(*) FROM "+resultTables[family]+" WHERE tenant_id=$1", f.tenant).Scan(&count))
		require.Equal(t, 1, count)
		require.NoError(t, f.row("SELECT count(*) FROM "+dirtyTables[family]+" WHERE tenant_id=$1", f.tenant).Scan(&count))
		require.Zero(t, count)
	}
	for _, table := range []string{"player_observations", "guild_boss_observations", "guild_clear_observations", "player_renown_facts", "guild_renown_facts"} {
		f.exec("DELETE FROM leaderboard_"+table+" WHERE tenant_id=$1", f.tenant)
	}
	for family := Family(0); family < familyCount; family++ {
		f.enqueue(family, "Boss", due)
		_, err := (&Worker{Store: f.db}).Drain(f.ctx, f.tenant, family)
		require.NoError(t, err)
		var count int
		require.NoError(t, f.row("SELECT count(*) FROM "+resultTables[family]+" WHERE tenant_id=$1", f.tenant).Scan(&count))
		require.Zero(t, count)
	}
}

func (f *fixture) claimPlayer() database.LeaderboardDirtyPlayerBossSubject {
	f.t.Helper()
	rows, err := f.db.ClaimLeaderboardPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(f.t, err)
	require.Len(f.t, rows, 1)
	return rows[0]
}
func playerPublish(c database.LeaderboardDirtyPlayerBossSubject, value float64, has bool) database.PublishLeaderboardPlayerBossSubjectParams {
	return database.PublishLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64, HasEvidence: has, ObservationCount: 1, RawPeak: value, RawForm: 0, RawFloor: 0, ProjectionVersion: 1, AlgorithmVersion: 1}
}
func (f *fixture) publish(p database.PublishLeaderboardPlayerBossSubjectParams) error {
	return f.db.InTx(f.tenantctx(), func(tx database.Store) error {
		return consumePublished(context.Background(), tx.PublishLeaderboardPlayerBossSubject(f.tenantctx(), []database.PublishLeaderboardPlayerBossSubjectParams{p}))
	}, nil)
}

func TestOwnershipFenceAndNewerDirt(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.enqueue(FamilyPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	clock, err := f.db.LeaderboardD2Clock(f.tenantctx())
	require.NoError(t, err)
	old := f.claimPlayer()
	afterClaim, err := f.db.LeaderboardD2Clock(f.tenantctx())
	require.NoError(t, err)
	require.False(t, old.LockedUntil.Time.Before(clock.Time.Add(ClaimLease)))
	require.False(t, old.LockedUntil.Time.After(afterClaim.Time.Add(ClaimLease)))
	// A second consumer cannot own an unexpired claim.
	rows, err := f.db.ClaimLeaderboardPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(t, err)
	require.Empty(t, rows)
	f.enqueue(FamilyPlayerBossSubject, "Boss", time.Now())
	require.NoError(t, f.publish(playerPublish(old, 100, true)))
	var token uuid.NullUUID
	var revision int64
	var until pgtype.Timestamptz
	require.NoError(t, f.row(`SELECT claim_token,revision,locked_until FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&token, &revision, &until))
	require.False(t, token.Valid)
	require.False(t, until.Valid)
	require.Equal(t, int64(2), revision)
	// Useful claimed snapshot published despite newer dirt, with a fresh owner next.
	next := f.claimPlayer()
	require.NotEqual(t, old.ClaimToken, next.ClaimToken)
	require.NoError(t, f.publish(playerPublish(next, 200, true)))
	require.NoError(t, f.publish(playerPublish(old, 999, true)))
	require.NoError(t, f.publish(playerPublish(old, 0, false)))
	var peak float64
	require.NoError(t, f.row(`SELECT raw_peak FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 200.0, peak)
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
}

func TestExpiredOwnerAndTakeover(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.enqueue(FamilyPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	old := f.claimPlayer()
	f.exec(`UPDATE leaderboard_dirty_player_boss_subjects SET locked_until=clock_timestamp()-interval '1 second' WHERE tenant_id=$1`, f.tenant)
	require.NoError(t, f.publish(playerPublish(old, 999, true)))
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
	next := f.claimPlayer()
	require.NotEqual(t, old.ClaimToken, next.ClaimToken)
	require.NoError(t, f.publish(playerPublish(next, 200, true)))
	require.NoError(t, f.publish(playerPublish(old, 999, true)))
	require.NoError(t, f.publish(playerPublish(old, 0, false)))
	var peak float64
	require.NoError(t, f.row(`SELECT raw_peak FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&peak))
	require.Equal(t, 200.0, peak)
}

func TestPublicationBatchRollbackAndRetry(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.evidence("Boss2")
	due := time.Now().Add(-time.Minute)
	f.enqueue(FamilyPlayerBossSubject, "Boss", due)
	f.enqueue(FamilyPlayerBossSubject, "Boss2", due)
	rows, err := f.db.ClaimLeaderboardPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	p1, p2 := playerPublish(rows[0], 100, true), playerPublish(rows[1], 100, true)
	p2.AlgorithmVersion = 0
	err = f.db.InTx(f.tenantctx(), func(tx database.Store) error {
		return consumePublished(context.Background(), tx.PublishLeaderboardPlayerBossSubject(f.tenantctx(), []database.PublishLeaderboardPlayerBossSubjectParams{p1, p2}))
	}, nil)
	require.Error(t, err)
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1 AND claim_token IS NOT NULL`, f.tenant).Scan(&count))
	require.Equal(t, 2, count)
	c := rows[0]
	retry := database.RetryLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
	require.NoError(t, consume(f.db.RetryLeaderboardPlayerBossSubject(f.tenantctx(), []database.RetryLeaderboardPlayerBossSubjectParams{retry})))
	var retryAfter time.Time
	require.NoError(t, f.row(`SELECT retry_after FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1 AND encounter_name=$2`, f.tenant, c.EncounterName).Scan(&retryAfter))
	f.enqueue(FamilyPlayerBossSubject, c.EncounterName, time.Now().Add(-time.Hour))
	var after time.Time
	require.NoError(t, f.row(`SELECT retry_after FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1 AND encounter_name=$2`, f.tenant, c.EncounterName).Scan(&after))
	require.Equal(t, retryAfter, after)
	claimed, err := f.db.ClaimLeaderboardPlayerBossSubject(f.tenantctx(), database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: 100})
	require.NoError(t, err)
	require.Empty(t, claimed)
}

func TestClaimCapAndPartialFlush(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	for i := range 101 {
		boss := fmt.Sprintf("Boss%03d", i)
		f.evidence(boss)
		f.enqueue(FamilyPlayerBossSubject, boss, time.Now().Add(-time.Minute))
	}
	w := Worker{Store: f.db}
	first, err := w.Drain(f.ctx, f.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err)
	require.Equal(t, 100, first.Claimed)
	require.Equal(t, 100, first.Processed)
	second, err := w.Drain(f.ctx, f.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err)
	require.Equal(t, 1, second.Claimed)
	require.Equal(t, 1, second.Processed)
	third, err := w.Drain(f.ctx, f.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err)
	require.Zero(t, third.Claimed)
	require.Equal(t, 100, BatchSize)
	require.Equal(t, 10*time.Minute, WorkTimeout)
	require.Equal(t, 15*time.Minute, ClaimLease)
}

// Hold the computation phase open with a channel barrier, not a sleep: producers
// must finish while a full page is owned and the computation transaction is open.
func TestProducerProgressDuringFullPageCompute(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	for i := range BatchSize {
		boss := fmt.Sprintf("Boss%03d", i)
		f.evidence(boss)
		f.enqueue(FamilyPlayerBossSubject, boss, time.Now().Add(-time.Minute))
	}
	ctx := f.tenantctx()
	computing, resume := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() {
		result, err := drainFamily(ctx, f.db,
			func(ctx context.Context, tx database.Store) ([]database.LeaderboardDirtyPlayerBossSubject, error) {
				return tx.ClaimLeaderboardPlayerBossSubject(ctx, database.ClaimLeaderboardPlayerBossSubjectParams{TenantID: f.tenant, LimitCount: BatchSize})
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject) ([]database.ComputeLeaderboardPlayerBossSubjectRow, error) {
				close(computing)
				select {
				case <-resume:
				case <-ctx.Done():
					return nil, ctx.Err()
				}
				params := make([]database.ComputeLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.ComputeLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid}
				}
				return collect(tx.ComputeLeaderboardPlayerBossSubject(ctx, params), len(params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject, rows []database.ComputeLeaderboardPlayerBossSubjectRow) error {
				params := make([]database.PublishLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					r := rows[i]
					params[i] = database.PublishLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid,
						ObservationCount: r.ObservationCount, RawPeak: r.RawPeak, RawForm: r.RawForm, RawFloor: r.RawFloor, PeakEncounterID: r.PeakEncounterID, PeakDurationMs: r.PeakDurationMs, HasEvidence: r.HasEvidence,
						ProjectionVersion: 1, AlgorithmVersion: 1, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64,
					}
				}
				return consumePublished(context.Background(), tx.PublishLeaderboardPlayerBossSubject(ctx, params))
			},
			func(ctx context.Context, tx database.Store, claims []database.LeaderboardDirtyPlayerBossSubject) error {
				params := make([]database.RetryLeaderboardPlayerBossSubjectParams, len(claims))
				for i, c := range claims {
					params[i] = database.RetryLeaderboardPlayerBossSubjectParams{TenantID: c.TenantID, InstanceName: c.InstanceName, DifficultyName: c.DifficultyName, MaxPlayers: c.MaxPlayers, EncounterName: c.EncounterName, PlayerClass: c.PlayerClass, PlayerSpec: c.PlayerSpec, PlayerSubSpec: c.PlayerSubSpec, Metric: c.Metric, RealmID: c.RealmID, PlayerGuid: c.PlayerGuid, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
				}
				return consume(tx.RetryLeaderboardPlayerBossSubject(ctx, params))
			})
		if err == nil && result.Processed != BatchSize {
			err = fmt.Errorf("processed %d", result.Processed)
		}
		done <- err
	}()
	select {
	case <-computing:
	case <-ctx.Done():
		t.Fatal(ctx.Err())
	}
	// Always release/join even when an assertion below fails.
	defer func() {
		close(resume)
		require.NoError(t, <-done)
		var count int
		require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1 AND revision=2 AND claim_token IS NULL`, f.tenant).Scan(&count))
		require.Equal(t, 15, count)
		require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
		require.Equal(t, BatchSize, count)
	}()
	started := time.Now()
	for i := range 15 {
		f.enqueue(FamilyPlayerBossSubject, fmt.Sprintf("Boss%03d", i), time.Now())
	}
	t.Logf("15 producer revisions while compute paused: %s", time.Since(started))
}

type recordingQueue struct {
	jobs    []river.JobArgs
	options []*river.InsertOpts
}

func (q *recordingQueue) Insert(_ context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.jobs = append(q.jobs, args)
	q.options = append(q.options, opts)
	return &rivertype.JobInsertResult{}, nil
}
func TestDispatchPaginationAndFutureNoSpin(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	queue := &recordingQueue{}
	dispatcher := Dispatcher{Store: f.db, Queue: queue}
	for range 101 {
		f.tenant = uuid.New()
		f.enqueue(FamilyPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	}
	future := uuid.New()
	f.tenant = future
	f.enqueue(FamilyPlayerBossSubject, "Future", time.Now().Add(time.Hour))
	require.NoError(t, dispatcher.dispatch(f.ctx, ArgsDispatch{}))
	require.Len(t, queue.jobs, 101)
	cursor, ok := queue.jobs[100].(ArgsDispatch)
	require.True(t, ok)
	require.Nil(t, queue.options[100]) // prompt cursor continuation, not periodic delay
	seen := map[uuid.UUID]bool{}
	for _, job := range queue.jobs[:100] {
		drain := job.(ArgsDrain)
		require.False(t, seen[drain.TenantID])
		seen[drain.TenantID] = true
	}
	queue.jobs = nil
	queue.options = nil
	require.NoError(t, dispatcher.dispatch(f.ctx, cursor))
	require.Len(t, queue.jobs, 1)
	last := queue.jobs[0].(ArgsDrain)
	require.False(t, seen[last.TenantID])
	require.NotEqual(t, future, last.TenantID)
	queue.jobs = nil
	require.NoError(t, dispatcher.dispatch(f.ctx, ArgsDispatch{AfterTenant: last.TenantID, AfterFamily: int32(last.Family)}))
	require.Empty(t, queue.jobs)
	// Production entry point is enabled and preserves future-only/no-spin behavior.
	require.NoError(t, dispatcher.Work(f.ctx, &river.Job[ArgsDispatch]{Args: ArgsDispatch{AfterTenant: last.TenantID, AfterFamily: int32(last.Family)}}))
	require.Empty(t, queue.jobs)
	require.True(t, DispatchEnabled)
}

func TestDrainCancellationAndPoisonIsolation(t *testing.T) {
	t.Parallel()
	for _, cancelWork := range []bool{false, true} {
		t.Run(fmt.Sprintf("cancel_%v", cancelWork), func(t *testing.T) {
			t.Parallel()
			f := newFixture(t)
			ctx, cancel := context.WithCancel(f.tenantctx())
			defer cancel()
			var retried, published []int
			result, err := drainFamily(ctx, f.db,
				func(context.Context, database.Store) ([]int, error) { return []int{1, 2, 3}, nil },
				func(ctx context.Context, _ database.Store, claims []int) ([]int, error) {
					if cancelWork {
						cancel()
						return nil, ctx.Err()
					}
					for _, c := range claims {
						if c == 2 {
							return nil, &pgconn.PgError{Code: "22003", Message: "test poison"}
						}
					}
					return claims, nil
				},
				func(_ context.Context, _ database.Store, claims, rows []int) error {
					published = append(published, claims...)
					return nil
				},
				func(ctx context.Context, _ database.Store, claims []int) error {
					if err := ctx.Err(); err != nil {
						return err
					}
					retried = append(retried, claims...)
					return nil
				},
			)
			if cancelWork {
				require.ErrorIs(t, err, context.Canceled)
				require.Empty(t, published)
				require.Equal(t, []int{1, 2, 3}, retried)
				require.Equal(t, 3, result.Failed)
			} else {
				require.NoError(t, err)
				require.Equal(t, []int{1, 3}, published)
				require.Equal(t, []int{2}, retried)
				require.Equal(t, 2, result.Processed)
				require.Equal(t, 1, result.Failed)
			}
		})
	}
}

// Publication starts with an old snapshot while takeover holds the row lock.
// PostgreSQL must recheck the token after that transaction commits (EPQ).
func TestPublicationRechecksTokenAfterLockWait(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	f.evidence("Boss")
	f.enqueue(FamilyPlayerBossSubject, "Boss", time.Now().Add(-time.Minute))
	old := f.claimPlayer()
	owner, err := f.pool.Acquire(servicetenant.AdminBypass(f.ctx))
	require.NoError(t, err)
	defer owner.Release()
	_, err = owner.Exec(f.ctx, "BEGIN")
	require.NoError(t, err)
	defer func() { _, _ = owner.Exec(context.Background(), "ROLLBACK") }()
	replacement := uuid.New()
	_, err = owner.Exec(f.ctx, `UPDATE leaderboard_dirty_player_boss_subjects SET claim_token=$2 WHERE tenant_id=$1`, f.tenant, replacement)
	require.NoError(t, err)
	publisher, err := f.pool.Acquire(f.tenantctx())
	require.NoError(t, err)
	defer publisher.Release()
	pid := publisher.Conn().PgConn().PID()
	done := make(chan error, 1)
	go func() {
		done <- consumePublished(context.Background(), database.NewQueries(publisher).PublishLeaderboardPlayerBossSubject(f.tenantctx(), []database.PublishLeaderboardPlayerBossSubjectParams{playerPublish(old, 999, true)}))
	}()
	// Ensure join/unblock even if the lock-wait assertion fails.
	joined := false
	defer func() {
		_, _ = owner.Exec(context.Background(), "ROLLBACK")
		if !joined {
			require.NoError(t, <-done)
		}
	}()
	require.Eventually(t, func() bool {
		var waiting bool
		err := f.row(`SELECT cardinality(pg_blocking_pids($1)) > 0`, pid).Scan(&waiting)
		return err == nil && waiting
	}, 10*time.Second, 10*time.Millisecond)
	_, err = owner.Exec(f.ctx, "COMMIT")
	require.NoError(t, err)
	// The deferred join must precede inspection.
	publishErr := <-done
	joined = true
	require.NoError(t, publishErr)
	var count int
	require.NoError(t, f.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&count))
	require.Zero(t, count)
	var token uuid.UUID
	require.NoError(t, f.row(`SELECT claim_token FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, f.tenant).Scan(&token))
	require.Equal(t, replacement, token)
}

func TestMeasureD2Page(t *testing.T) {
	if os.Getenv("CHRONICLE_MEASURE_D2") != "1" {
		t.Skip("opt-in local bounded-page measurement")
	}
	t.Parallel()
	for _, history := range []int{100, 1000} {
		t.Run(fmt.Sprintf("history_%d", history), func(t *testing.T) {
			f := newFixture(t)
			for i := range BatchSize {
				f.evidence(fmt.Sprintf("Boss%03d", i))
			}
			f.exec(`INSERT INTO leaderboard_player_observations SELECT (jsonb_populate_record(NULL::leaderboard_player_observations,to_jsonb(o)||jsonb_build_object('run_id',md5(o.run_id::text||g::text)::uuid,'metric_value',g::double precision))).* FROM leaderboard_player_observations o CROSS JOIN generate_series(1,$2::integer) g WHERE tenant_id=$1`, f.tenant, history-1)
			f.exec(`ANALYZE leaderboard_player_observations`)
			worker := Worker{Store: f.db}
			for sample := range 7 {
				for i := range BatchSize {
					f.enqueue(FamilyPlayerBossSubject, fmt.Sprintf("Boss%03d", i), time.Now().Add(-time.Minute))
				}
				start := time.Now()
				result, err := worker.Drain(f.ctx, f.tenant, FamilyPlayerBossSubject)
				elapsed := time.Since(start)
				require.NoError(t, err)
				require.Equal(t, BatchSize, result.Processed)
				t.Logf("history=%d scopes=%d sample=%d elapsed_ms=%.3f", history, BatchSize, sample, float64(elapsed.Microseconds())/1000)
			}
		})
	}
}
