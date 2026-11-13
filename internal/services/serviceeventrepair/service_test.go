package serviceeventrepair

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

type repairFixture struct {
	ctx        context.Context
	db         database.Store
	pool       *pgxpool.Pool
	service    *Service
	id, tenant uuid.UUID
}

func newRepairFixture(t *testing.T, n int) *repairFixture {
	t.Helper()
	ctx := servicetenant.AdminBypass(testutil.Context(t, testutil.WaitLong))
	url := dbtestutil.NewConnectionURL(t)
	cfg, ready, err := database.PoolConfig(slog.Default(), url)
	require.NoError(t, err)
	cfg.PrepareConn = func(ctx context.Context, c *pgx.Conn) (bool, error) { return true, servicetenant.PrepareConn(ctx, c) }
	cfg.AfterRelease = func(c *pgx.Conn) bool { servicetenant.ResetConn(c); return true }
	ready()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	db := database.New(pool)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{SkipUnknownJobCheck: true})
	require.NoError(t, err)
	f := &repairFixture{ctx: ctx, db: db, pool: pool, service: New(db, &riverqueue.Queues{Client: client}), id: uuid.New(), tenant: uuid.New()}
	_, err = pool.Exec(ctx, "INSERT INTO tenants(id,name) VALUES($1,'Event repair test')", f.tenant)
	require.NoError(t, err)
	selection, err := json.Marshal(CreateRequest{Operation: OperationRazorgore, TenantID: f.tenant, Limit: n})
	require.NoError(t, err)
	_, err = db.CreateEventRepairOperation(ctx, database.CreateEventRepairOperationParams{ID: f.id, Operation: OperationRazorgore, Version: Version, CreatedBy: uuid.New(), TenantID: f.tenant, Selection: selection, Total: int32(n)})
	require.NoError(t, err)

	owner, server, realm, group := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO users(id,username,email) VALUES($1,'repair-test',$2)`, owner, owner.String()+"@example.test")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers(id,name,tenant_id) VALUES($1,$2,$3)`, server, server.String(), f.tenant)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_server_realms(id,server_id,name) VALUES($1,$2,$3)`, realm, server, realm.String())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_log_groups(id,owner) VALUES($1,$2)`, group, owner)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO parsed_log_group(id) VALUES($1)`, group)
	require.NoError(t, err)
	for range n {
		instance := uuid.New()
		_, err = pool.Exec(ctx, `INSERT INTO log_instances(id,realm_id,log_group_id,name) VALUES($1,$2,$3,'Blackwing Lair')`, instance, realm, group)
		require.NoError(t, err)
		_, err = db.InsertEventRepairItem(ctx, database.InsertEventRepairItemParams{OperationID: f.id, TenantID: f.tenant, InstanceID: instance})
		require.NoError(t, err)
	}
	f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
		return &RazorgoreRepairPlan{TenantID: f.tenant, EvidenceHash: "stable", Changes: []string{}}, nil
	}
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error { return nil }
	f.service.jobs[OperationRazorgore].revalidate = func(context.Context, database.Store, *RazorgoreRepairPlan) error { return nil }
	f.service.lockSource = func(context.Context, database.Store, uuid.UUID) error { return nil }
	return f
}
func (f *repairFixture) canonicalJobs(t *testing.T) int {
	t.Helper()
	var count int
	require.NoError(t, f.pool.QueryRow(f.ctx, "SELECT count(*) FROM river_job WHERE kind='refresh-ranking-runs'").Scan(&count))
	return count
}
func TestSuccessfulNoopDurablyEnqueuesCanonicalRefresh(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	more, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	require.False(t, more)
	require.Zero(t, f.canonicalJobs(t), "dry run must not enqueue ratings")
	op, err := f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	require.Equal(t, "applying", op.State)
	more, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	require.False(t, more)
	require.Equal(t, 1, f.canonicalJobs(t), "even no-op must durably enqueue canonical refresh")
	op, err = f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "completed", op.State)
	require.Equal(t, 1, op.Applied)
	require.True(t, op.Items[0].RatingsQueued)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	require.Equal(t, 1, f.canonicalJobs(t), "retry must not reapply completed item")
}
func TestCanonicalQueueFailureRollsBackSourceAndCheckpoint(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	// Deliberately reject the exact durable canonical obligation, not the admin job.
	conn, err := f.pool.Acquire(f.ctx)
	require.NoError(t, err)
	_, err = conn.Exec(f.ctx, "RESET ROLE; ALTER TABLE river_job ADD CONSTRAINT reject_event_repair_test CHECK (kind <> 'refresh-ranking-runs'); SET ROLE chronicle")
	conn.Release()
	require.NoError(t, err)
	f.service.jobs[OperationRazorgore].apply = func(ctx context.Context, tx database.Store, _ *RazorgoreRepairPlan) error {
		// A fixture source write in the same transaction must roll back with enqueue.
		_, err := tx.UpdateEventRepairOperation(ctx, database.UpdateEventRepairOperationParams{ID: f.id, TenantID: f.tenant, State: "applying", Total: 99, Processed: 99, Applied: 99, LastError: "source mutation"})
		return err
	}
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.Error(t, err)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 1, op.Total)
	require.Zero(t, op.Applied)
	require.Equal(t, "ready", op.Items[0].State)
	require.NotEmpty(t, op.LastError)
	require.Zero(t, f.canonicalJobs(t))
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, op.Items[0].InstanceID)
	require.NoError(t, err)
	require.Empty(t, receipts, "queue failure must roll back the permanent receipt")
}
func TestStaleEvidenceAndSkippedItemsNeverEnqueue(t *testing.T) {
	t.Parallel()
	for _, skip := range []bool{false, true} {
		t.Run(map[bool]string{false: "stale", true: "requires_reparse"}[skip], func(t *testing.T) {
			t.Parallel()
			f := newRepairFixture(t, 1)
			if skip {
				f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
					return &RazorgoreRepairPlan{TenantID: f.tenant, RequiresReparse: true, Reason: "original-log reparse required"}, nil
				}
			}
			_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
			require.NoError(t, err)
			_, err = f.service.Apply(f.ctx, f.id, uuid.New())
			if skip {
				require.ErrorIs(t, err, ErrConflict)
			} else {
				require.NoError(t, err)
			}
			if !skip {
				f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
					return &RazorgoreRepairPlan{TenantID: f.tenant, EvidenceHash: "changed"}, nil
				}
			}
			_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
			require.NoError(t, err)
			op, err := f.service.Get(f.ctx, f.id)
			require.NoError(t, err)
			require.Equal(t, 1, op.Skipped)
			require.Zero(t, op.Applied)
			require.False(t, op.Items[0].RatingsQueued)
			require.Zero(t, f.canonicalJobs(t))
			receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, op.Items[0].InstanceID)
			require.NoError(t, err)
			require.Empty(t, receipts)
		})
	}
}
func TestBoundedPagesResumeAndCancellation(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 26)
	more, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	require.True(t, more)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 25, op.Processed)
	more, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	require.False(t, more)
	op, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	more, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	require.True(t, more)
	op, err = f.service.Cancel(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	require.Equal(t, 25, op.Applied)
	require.Equal(t, "cancelled", op.State)
	more, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	require.False(t, more)
	op, err = f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 25, op.Applied)
	require.Equal(t, 25, f.canonicalJobs(t))
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
}

func TestCreateAndApplyEnqueueAtomically(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	unqueued := New(f.db, nil)
	_, err := unqueued.Create(f.ctx, uuid.New(), CreateRequest{Operation: OperationRazorgore, TenantID: f.tenant, Limit: 25})
	require.ErrorContains(t, err, "queue unavailable")
	rows, err := f.service.List(f.ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1, "failed create must not persist operation")
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = unqueued.Apply(f.ctx, f.id, uuid.New())
	require.ErrorContains(t, err, "queue unavailable")
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "ready", op.State, "failed apply enqueue must not change state")
	created, err := f.service.Create(f.ctx, uuid.New(), CreateRequest{Operation: OperationRazorgore, TenantID: f.tenant, Limit: 25})
	require.NoError(t, err)
	require.Equal(t, "dry_running", created.State)
	var jobs int
	require.NoError(t, f.pool.QueryRow(f.ctx, "SELECT count(*) FROM river_job WHERE kind='admin-event-repair'").Scan(&jobs))
	require.Equal(t, 1, jobs)
}

func TestTransientFailureRetainsCheckpointForRetry(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 2)
	evaluated := 0
	f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
		evaluated++
		if evaluated == 2 {
			return nil, errors.New("temporary read failure")
		}
		return &RazorgoreRepairPlan{TenantID: f.tenant, EvidenceHash: "stable"}, nil
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.ErrorContains(t, err, "temporary read failure")
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 1, op.Processed)
	require.Equal(t, "dry_running", op.State)
	require.NotEmpty(t, op.LastError)
	more, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	require.False(t, more)
	require.Equal(t, 3, evaluated, "retry evaluates only the unfinished item")
	op, err = f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 2, op.Processed)
	require.Empty(t, op.LastError)
}

func TestRetryDoesNotAuthorizeApply(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	_, err := f.service.Retry(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict, "healthy active work must not be retried")
	_, err = f.db.UpdateEventRepairOperationState(f.ctx, database.UpdateEventRepairOperationStateParams{ID: f.id, TenantID: f.tenant, State: "dry_running", LastError: "transient worker failure"})
	require.NoError(t, err)
	op, err := f.service.Retry(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	require.Equal(t, "dry_running", op.State)
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Retry(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	op, err = f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "ready", op.State)
	require.Zero(t, f.canonicalJobs(t))
}

func TestSelectedTenantCannotChangeDuringRepair(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
		return &RazorgoreRepairPlan{TenantID: uuid.New(), EvidenceHash: "stable"}, nil
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "skipped", op.Items[0].State)
	require.Contains(t, op.Items[0].Reason, "selected tenant")
	require.Zero(t, f.canonicalJobs(t))
}

func TestWorkerDurablySnoozesAfterBoundedPage(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 26)
	worker := Worker{Service: f.service}
	err := worker.Work(f.ctx, &river.Job[Args]{Args: Args{OperationID: f.id, Phase: "dry_running"}})
	var snooze *river.JobSnoozeError
	require.ErrorAs(t, err, &snooze)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 25, op.Processed)
	require.NoError(t, worker.Work(f.ctx, &river.Job[Args]{Args: Args{OperationID: f.id, Phase: "dry_running"}}))
	op, err = f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "ready", op.State)
}

func TestReconstructionOutsideTransactionAndStaleRecheck(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	f.service.jobs[OperationRazorgore].evaluate = func(_ context.Context, db database.Store, _ uuid.UUID) (*RazorgoreRepairPlan, error) {
		_, inTx := database.PGXTx(db)
		require.False(t, inTx, "gzip/reconstruction must not hold a transaction")
		return &RazorgoreRepairPlan{TenantID: f.tenant, EvidenceHash: "stable"}, nil
	}
	f.service.jobs[OperationRazorgore].revalidate = func(_ context.Context, db database.Store, _ *RazorgoreRepairPlan) error {
		_, inTx := database.PGXTx(db)
		require.True(t, inTx, "fingerprint recheck must share source write transaction")
		return nil
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	f.service.jobs[OperationRazorgore].revalidate = func(context.Context, database.Store, *RazorgoreRepairPlan) error { return ErrStaleEvidence }
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error {
		t.Fatal("stale evidence must not mutate source")
		return nil
	}
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "stale", op.Items[0].State)
	require.Zero(t, f.canonicalJobs(t))
}

func TestPreviouslyProcessedRazorgoreNeverEnqueues(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	e := fixtureRazorgoreNumeric(t)
	e.Server.TenantID = uuid.NullUUID{UUID: f.tenant, Valid: true}
	e.Encounters[0].RankingStartOffsetMs = pgtype.Int8{Int64: 30000, Valid: true}
	e.Encounters[0].RankingEndOffsetMs = pgtype.Int8{Int64: 60000, Valid: true}
	for i := range e.Events {
		e.Events[i].Events = []byte("corrupt")
	}
	f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
		return evaluateRazorgoreEvidence(e)
	}
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error {
		t.Error("skipped instance must not apply")
		return nil
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	op, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, 1, op.Skipped)
	require.Zero(t, op.Applied)
	require.False(t, op.Items[0].RatingsQueued)
	require.Zero(t, f.canonicalJobs(t))
}

func TestEmptyAndSkippedPreviewsCompleteAutomatically(t *testing.T) {
	t.Parallel()
	for _, count := range []int{0, 1, 26} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			t.Parallel()
			f := newRepairFixture(t, count)
			f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
				return &RazorgoreRepairPlan{TenantID: f.tenant, RequiresReparse: true, Reason: "already repaired"}, nil
			}
			for {
				more, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
				require.NoError(t, err)
				if !more {
					break
				}
				row, err := f.db.LookupEventRepairOperation(f.ctx, f.id)
				require.NoError(t, err)
				require.Equal(t, "dry_running", row.State)
			}
			row, err := f.db.LookupEventRepairOperation(f.ctx, f.id)
			require.NoError(t, err)
			require.Equal(t, "completed", row.State, "completion must persist without opening report")
			require.EqualValues(t, count, row.Skipped)
			_, err = f.service.Apply(f.ctx, f.id, uuid.New())
			require.ErrorIs(t, err, ErrConflict)
			_, err = f.service.Cancel(f.ctx, f.id, uuid.New())
			require.ErrorIs(t, err, ErrConflict)
			require.Zero(t, f.canonicalJobs(t))
			_, err = f.db.UpdateEventRepairOperationState(f.ctx, database.UpdateEventRepairOperationStateParams{ID: f.id, TenantID: f.tenant, State: "ready"})
			require.NoError(t, err)
			_, err = f.service.Apply(f.ctx, f.id, uuid.New())
			require.ErrorIs(t, err, ErrConflict)
			_, err = f.service.Cancel(f.ctx, f.id, uuid.New())
			require.ErrorIs(t, err, ErrConflict)
			report, err := f.service.Get(f.ctx, f.id)
			require.NoError(t, err)
			require.Equal(t, "completed", report.State)
			require.Zero(t, f.canonicalJobs(t))
		})
	}
}
