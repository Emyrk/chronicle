package serviceratings

import (
	"context"
	"errors"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestOperationCompletionRequiresDiscoveryAndDrain(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now().UTC(), Valid: true}})
	require.NoError(t, err)
	complete := database.CompleteLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant}
	get := database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant}
	require.NoError(t, s.db.CompleteLeaderboardOperation(ctx, complete))
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.Equal(t, "discovering", op.State)
	require.NoError(t, s.db.DrainLeaderboardOperation(ctx, database.DrainLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant}))
	require.NoError(t, s.db.EnqueueLeaderboardRun(ctx, database.EnqueueLeaderboardRunParams{TenantID: s.tenant, RunID: s.run, ProcessAfter: database.Timestamptz(time.Now().Add(time.Hour))}))
	require.NoError(t, s.db.CompleteLeaderboardOperation(ctx, complete))
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.Equal(t, "draining", op.State)
	_, err = s.db.PauseLeaderboardOperation(ctx, database.PauseLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	s.exec(`DELETE FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant)
	require.NoError(t, s.db.CompleteLeaderboardOperation(ctx, complete))
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.Equal(t, "paused", op.State)
	_, err = s.db.ResumeLeaderboardOperation(ctx, database.ResumeLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.NoError(t, s.db.CompleteLeaderboardOperation(ctx, complete))
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.Equal(t, "completed", op.State)
	require.True(t, op.CompletedAt.Valid)
	history, err := s.db.ListLeaderboardOperations(ctx, s.tenant)
	require.NoError(t, err)
	require.Len(t, history, 1)
}

func TestOperationDatePagesResumeAndMissingDates(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`INSERT INTO log_instances SELECT(jsonb_populate_record(NULL::log_instances,to_jsonb(i)||jsonb_build_object('id',gen_random_uuid(),'hashed_slug',NULL))).* FROM log_instances i CROSS JOIN generate_series(1,101) WHERE i.id=$1`, s.instance)
	s.exec(`INSERT INTO ranking_runs SELECT(jsonb_populate_record(NULL::ranking_runs,to_jsonb(r)||jsonb_build_object('run_id',i.id,'representative_instance_id',i.id,'end_time','2026-01-01T00:00:00Z'))).* FROM ranking_runs r CROSS JOIN log_instances i WHERE r.run_id=$1 AND i.id<>$2`, s.run, s.instance)
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", AfterDate: pgtype.Date{Time: time.Date(2025, 12, 31, 0, 0, 0, 0, time.UTC), Valid: true}, BeforeDate: pgtype.Date{Time: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), Valid: true}})
	require.NoError(t, err)
	worker := &OperationWorker{Store: s.db}
	require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	get := database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant}
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.EqualValues(t, 100, op.Discovered)
	require.EqualValues(t, 1, op.MissingDates)
	require.False(t, op.DiscoveryComplete)
	// Deleting the cursor row must not break resumption: cursor stores values, not a FK.
	s.exec(`DELETE FROM ranking_runs WHERE run_id=$1`, op.CursorID)
	// Moving an already visited run ahead of the date cursor may re-enqueue it,
	// but the durable dirty key coalesces that work rather than losing another run.
	s.exec(`UPDATE ranking_runs SET end_time='2026-01-01T00:01:00Z' WHERE run_id=(SELECT run_id FROM ranking_runs WHERE end_time IS NOT NULL AND run_id<$1 ORDER BY run_id LIMIT 1)`, op.CursorID)

	_, err = s.db.PauseLeaderboardOperation(ctx, database.PauseLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	_, err = s.db.ResumeLeaderboardOperation(ctx, database.ResumeLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.EqualValues(t, 102, op.Discovered)
	require.False(t, op.DiscoveryComplete)
	require.Equal(t, "evidence", op.Phase)
	for range 10 {
		require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	}
	op, err = s.db.GetLeaderboardOperation(ctx, get)
	require.NoError(t, err)
	require.True(t, op.DiscoveryComplete)
	require.Equal(t, "draining", op.State)
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 101, count)
}

func TestOperationDateRangeExcludesRunsBeforeInclusiveStart(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`UPDATE ranking_runs SET end_time='2026-01-01T00:00:00Z' WHERE run_id=$1`, s.run)
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{
		TenantID:    s.tenant,
		RequestedBy: uuid.New(),
		Purpose:     "bootstrap",
		Scope:       "tenant",
		AfterDate:   pgtype.Date{Time: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), Valid: true},
		BeforeDate:  pgtype.Date{Time: time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC), Valid: true},
	})
	require.NoError(t, err)
	require.NoError(t, (&OperationWorker{Store: s.db}).Step(ctx, s.tenant, op.ID))
	op, err = s.db.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.Zero(t, op.Discovered)
	require.Equal(t, "evidence", op.Phase)
}

func TestOperationRepairsOrphanEvidenceAndResults(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	require.NoError(t, s.direct(s.compute()))
	s.exec(`DELETE FROM ranking_runs WHERE run_id=$1`, s.run)
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "repair", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	w := &OperationWorker{Store: s.db}
	for range 12 {
		require.NoError(t, w.Step(ctx, s.tenant, op.ID))
	}
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1 AND run_id=$2`, s.tenant, s.run).Scan(&count))
	require.Equal(t, 1, count)
	_, err = (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_observations WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
}

func TestOperationRepairsResultsWithoutEvidence(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	require.NoError(t, s.direct(s.compute()))
	for f := Family(0); f < familyCount; f++ {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, f)
		require.NoError(t, err)
	}
	s.exec(`DELETE FROM ranking_runs WHERE run_id=$1`, s.run)
	for _, table := range []string{"player_observations", "player_renown_facts", "guild_renown_facts"} {
		s.exec("DELETE FROM leaderboard_"+table+" WHERE tenant_id=$1", s.tenant)
	}
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "repair", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	w := &OperationWorker{Store: s.db}
	for range 20 {
		require.NoError(t, w.Step(ctx, s.tenant, op.ID))
	}
	for f := Family(0); f < familyCount; f++ {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, f)
		require.NoError(t, err)
	}
	require.NoError(t, w.Step(ctx, s.tenant, op.ID))
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
	current, err := s.db.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.Equal(t, "completed", current.State)
}

func TestOperationDateDiscoveryUsesExistingIndex(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	s.exec(`WITH instances AS (INSERT INTO log_instances(id,realm_id,log_group_id,name) SELECT gen_random_uuid(),$1,$2,'Fixture raid' FROM generate_series(1,20000) RETURNING id) INSERT INTO ranking_runs(run_id,representative_instance_id,realm_id,instance_name,difficulty_name,max_players,start_time,end_time,boss_coverage,member_count,source_updated_at) SELECT id,id,$1,'Fixture raid','Normal',40,now()-interval '1 day',timestamp '2026-01-01'+row_number() OVER(ORDER BY id)*interval '1 minute',1,1,now() FROM instances`, s.realm, s.group)
	s.exec(`ANALYZE ranking_runs`)
	var plan string
	require.NoError(t, s.row(`EXPLAIN (ANALYZE,FORMAT JSON) SELECT run_id,end_time FROM ranking_runs WHERE realm_id=$1 AND end_time<'2026-01-02Z' AND (end_time,run_id)>('2026-01-01Z','00000000-0000-0000-0000-000000000000'::uuid) ORDER BY end_time,run_id LIMIT 100`, s.realm).Scan(&plan))
	require.Contains(t, plan, "ranking_runs_realm_end_time_idx")
	t.Log(plan)
}

type operationRollbackStore struct{ database.Store }

func (s operationRollbackStore) InTx(ctx context.Context, f func(database.Store) error, opts *pgx.TxOptions) error {
	return s.Store.InTx(ctx, func(tx database.Store) error {
		if err := f(tx); err != nil {
			return err
		}
		return errors.New("injected operation crash before commit")
	}, opts)
}
func TestOperationCrashRollsBackCheckpointAndEnqueue(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "repair", Scope: "run", RunID: uuid.NullUUID{UUID: s.run, Valid: true}, BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	broken := &OperationWorker{Store: operationRollbackStore{s.db}}
	require.ErrorContains(t, broken.Step(ctx, s.tenant, op.ID), "injected operation crash")
	op, err = s.db.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.Zero(t, op.Discovered)
	require.False(t, op.DiscoveryComplete)
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, (&OperationWorker{Store: s.db}).Step(ctx, s.tenant, op.ID))
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Equal(t, 1, count)
}

func TestOperationTenantIsolationAndUnfinishedUniqueness(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	p := database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Now(), Valid: true}}
	op, err := s.db.CreateLeaderboardOperation(s.tenantctx(), p)
	require.NoError(t, err)
	_, err = s.db.CreateLeaderboardOperation(s.tenantctx(), p)
	require.Error(t, err)
	other := servicetenant.WithTenantID(s.ctx, uuid.New())
	_, err = s.db.LookupLeaderboardOperation(other, op.ID)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	rows, err := s.db.ActiveLeaderboardOperation(other, s.tenant)
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestOperationDispatcherTenantPagination(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	for range 101 {
		tenant := uuid.New()
		s.exec(`INSERT INTO tenants(id,name) VALUES($1,$2)`, tenant, tenant.String())
		s.exec(`INSERT INTO leaderboard_operations(tenant_id,requested_by,purpose,scope,before_date) VALUES($1,$2,'bootstrap','tenant','2026-01-01')`, tenant, uuid.New())
	}
	queue := &recordingQueue{}
	d := &OperationDispatcher{Store: s.db, Queue: queue}
	require.NoError(t, d.Work(s.ctx, &river.Job[ArgsOperationDispatch]{Args: ArgsOperationDispatch{}}))
	require.Len(t, queue.jobs, 101)
	cursor, ok := queue.jobs[100].(ArgsOperationDispatch)
	require.True(t, ok)
	queue.jobs = nil
	require.NoError(t, d.Work(s.ctx, &river.Job[ArgsOperationDispatch]{Args: cursor}))
	require.Len(t, queue.jobs, 1)
}

func TestOperationBootstrapEndToEnd(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.exec(`UPDATE ranking_runs SET end_time='2026-01-01T00:00:10Z' WHERE run_id=$1`, s.run)
	op, err := s.db.CreateLeaderboardOperation(ctx, database.CreateLeaderboardOperationParams{TenantID: s.tenant, RequestedBy: uuid.New(), Purpose: "bootstrap", Scope: "tenant", BeforeDate: pgtype.Date{Time: time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC), Valid: true}})
	require.NoError(t, err)
	worker := &OperationWorker{Store: s.db}
	for range 12 {
		require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	}
	repaired, err := (&RepairWorker{Store: s.db}).Drain(s.ctx, s.tenant)
	require.NoError(t, err)
	require.True(t, repaired)
	for family := Family(0); family < familyCount; family++ {
		_, err := (&Worker{Store: s.db}).Drain(s.ctx, s.tenant, family)
		require.NoError(t, err)
	}
	require.NoError(t, worker.Step(ctx, s.tenant, op.ID))
	current, err := s.db.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: op.ID, TenantID: s.tenant})
	require.NoError(t, err)
	require.Equal(t, "completed", current.State)
	var peak float64
	var encounter uuid.UUID
	var duration int64
	require.NoError(t, s.row(`SELECT raw_peak,peak_encounter_id,peak_duration_ms FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&peak, &encounter, &duration))
	require.Equal(t, float64(100), peak)
	require.Equal(t, s.encounter, encounter)
	require.EqualValues(t, 10000, duration)
}
