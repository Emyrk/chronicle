package serviceratings

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestContinuationYieldsSameJobOnlyWhenDue(t *testing.T) {
	t.Parallel()
	for _, due := range []bool{false, true} {
		calls := 0
		err := continueWork(context.Background(), func(context.Context) (bool, error) { calls++; return true, nil }, func(context.Context) (bool, error) { return due, nil })
		require.Equal(t, WorkPages, calls)
		if due {
			var snooze *river.JobSnoozeError
			require.ErrorAs(t, err, &snooze)
			require.Equal(t, time.Second, snooze.Duration)
		} else {
			require.NoError(t, err)
		}
	}
	calls := 0
	require.NoError(t, continueWork(context.Background(), func(context.Context) (bool, error) { calls++; return false, nil }, func(context.Context) (bool, error) { t.Fatal("empty page must not probe/loop"); return false, nil }))
	require.Equal(t, 1, calls)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	require.ErrorIs(t, continueWork(ctx, func(context.Context) (bool, error) { t.Fatal("cancelled page"); return false, nil }, nil), context.Canceled)
}

func TestD2WorkDrainsMultiplePagesWithoutPeriodicTick(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	for i := 0; i < BatchSize+1; i++ {
		s.exec(`INSERT INTO leaderboard_dirty_player_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid) VALUES($1,'Fixture raid','Normal',40,'Boss','MAGE','Frost','','dps',$2,$3)`, s.tenant, s.realm, uuid.NewString())
	}
	m, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	worker := &TenantWorker{Worker: &Worker{Store: s.db, Metrics: m}}
	require.NoError(t, worker.Work(s.ctx, &river.Job[ArgsDrain]{Args: ArgsDrain{TenantID: s.tenant, Family: FamilyPlayerBossSubject}}))
	var pending int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&pending))
	require.Zero(t, pending)
	require.Equal(t, float64(BatchSize+1), counterValue(t, m.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "committed")))
}

func TestD1WorkSnoozesUntilAllRunsProcessed(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	for range 101 {
		s.exec(`INSERT INTO leaderboard_dirty_runs(tenant_id,run_id) VALUES($1,$2)`, s.tenant, uuid.New())
	}
	w := &RepairWorker{Store: s.db}
	// Simulate River re-running the SAME snoozed job; no insert or periodic dispatch.
	job := &river.Job[ArgsRepair]{Args: ArgsRepair{TenantID: s.tenant}}
	yields := 0
	for range 11 {
		err := w.Work(s.ctx, job)
		if err == nil {
			break
		}
		var snooze *river.JobSnoozeError
		require.ErrorAs(t, err, &snooze)
		yields++
	}
	require.Equal(t, 10, yields)
	var pending int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&pending))
	require.Zero(t, pending)
}

func TestD1WorkStopsOnUnavailableClaims(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	claim := s.claim()
	worker := &RepairWorker{Store: s.db}
	job := &river.Job[ArgsRepair]{Args: ArgsRepair{TenantID: s.tenant}}
	require.NoError(t, worker.Work(s.ctx, job)) // leased only: no snooze
	require.NoError(t, s.db.RetryLeaderboardRun(s.tenantctx(), database.RetryLeaderboardRunParams{TenantID: s.tenant, RunID: s.run, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64}))
	require.NoError(t, worker.Work(s.ctx, job)) // backoff only
	s.exec(`UPDATE leaderboard_dirty_runs SET retry_after='-infinity',process_after=clock_timestamp()+interval '1 hour' WHERE tenant_id=$1`, s.tenant)
	require.NoError(t, worker.Work(s.ctx, job)) // future only
}

func TestOperationWorkCrossesEmptyPhasesAndStopsDraining(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.exec(`DELETE FROM ranking_runs WHERE run_id=$1`, s.run)
	op, err := s.db.CreateLeaderboardOperation(s.tenantctx(), database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	w := &OperationWorker{Store: s.db}
	job := &river.Job[ArgsOperationPage]{Args: ArgsOperationPage{TenantID: s.tenant, OperationID: op.ID}}
	err = w.Work(s.ctx, job)
	var snooze *river.JobSnoozeError
	if errors.As(err, &snooze) {
		err = w.Work(s.ctx, job)
	}
	require.NoError(t, err)
	current, err := s.db.GetLeaderboardOperation(s.tenantctx(), database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.True(t, current.DiscoveryComplete)
	// A draining operation with durable future work must exit, not immediate-snooze.
	s.enqueueRun()
	require.NoError(t, w.Work(s.ctx, job))
}

type pauseAfterOperationPage struct {
	database.Store
	tenant, id uuid.UUID
	pages      int
}

func (s *pauseAfterOperationPage) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	err := s.Store.InTx(ctx, fn, opts)
	if err != nil {
		return err
	}
	s.pages++
	if s.pages == 1 {
		_, err = s.PauseLeaderboardOperation(ctx, database.PauseLeaderboardOperationParams{ID: s.id, TenantID: s.tenant})
	}
	return err
}
func TestOperationWorkObservesPauseBeforeNextPage(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	op, err := s.db.CreateLeaderboardOperation(s.tenantctx(), database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	wrapped := &pauseAfterOperationPage{Store: s.db, tenant: s.tenant, id: op.ID}
	worker := &OperationWorker{Store: wrapped}
	require.NoError(t, worker.Work(s.ctx, &river.Job[ArgsOperationPage]{Args: ArgsOperationPage{TenantID: s.tenant, OperationID: op.ID}}))
	require.Equal(t, 1, wrapped.pages)
	current, err := s.db.GetLeaderboardOperation(s.tenantctx(), database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.Equal(t, "paused", current.State)
}

type failedNudgeQueue struct{}

func (failedNudgeQueue) Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	return nil, errors.New("injected nudge outage")
}
func TestCommittedWorkSurvivesFailedNudge(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.enqueueRun()
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	worker := &RepairWorker{Store: s.db, Metrics: metrics, Queue: failedNudgeQueue{}}
	require.NoError(t, worker.Work(s.ctx, &river.Job[ArgsRepair]{Args: ArgsRepair{TenantID: s.tenant}}))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "runs", "publish", "committed")))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "dispatch_nudge", "failed")))
	var pending int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&pending))
	require.Zero(t, pending)
}
func TestD2WorkStopsOnUnavailableClaims(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	worker := &TenantWorker{Worker: &Worker{Store: s.db}}
	job := &river.Job[ArgsDrain]{Args: ArgsDrain{TenantID: s.tenant, Family: FamilyPlayerBossSubject}}
	for _, change := range []string{"process_after=clock_timestamp()+interval '1 hour'", "process_after='-infinity',retry_after=clock_timestamp()+interval '1 hour'", "retry_after='-infinity',claim_token=gen_random_uuid(),claimed_revision=revision,locked_until=clock_timestamp()+interval '1 hour'"} {
		s.exec("UPDATE leaderboard_dirty_player_boss_subjects SET "+change+" WHERE tenant_id=$1", s.tenant)
		require.NoError(t, worker.Work(s.ctx, job))
	}
}
