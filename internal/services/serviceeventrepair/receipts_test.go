package serviceeventrepair

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func receiptInstance(t *testing.T, f *repairFixture) uuid.UUID {
	t.Helper()
	o, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	return o.Items[0].InstanceID
}
func anotherReceiptJob(t *testing.T, f *repairFixture, instance uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := f.db.CreateEventRepairOperation(f.ctx, database.CreateEventRepairOperationParams{ID: id, Operation: OperationRazorgore, Version: Version, CreatedBy: uuid.New(), TenantID: f.tenant, Selection: []byte(`{}`), Total: 1})
	require.NoError(t, err)
	_, err = f.db.InsertEventRepairItem(f.ctx, database.InsertEventRepairItemParams{OperationID: id, TenantID: f.tenant, InstanceID: instance})
	require.NoError(t, err)
	return id
}
func TestReceiptPermanentAcrossJobsAndVersions(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	instance := receiptInstance(t, f)
	f.service.jobs[OperationRazorgore].evaluate = func(context.Context, database.Store, uuid.UUID) (*RazorgoreRepairPlan, error) {
		return &RazorgoreRepairPlan{TenantID: f.tenant, EvidenceHash: "stable", Warnings: []string{"omitted irrelevant event"}, Details: map[string]any{"omissions": []any{map[string]any{"reason": "irrelevant"}}}}, nil
	}
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	preview, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, []string{"omitted irrelevant event"}, preview.Items[0].Warnings)
	require.Contains(t, preview.Items[0].Details, "omissions")
	before, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, before)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	require.Equal(t, f.id, receipts[0].OperationID)
	require.EqualValues(t, 1, receipts[0].Version)
	require.True(t, receipts[0].AppliedAt.Valid)
	require.JSONEq(t, `["omitted irrelevant event"]`, string(receipts[0].Warnings))
	_, err = f.db.InsertEventRepairReceipt(f.ctx, database.InsertEventRepairReceiptParams{InstanceID: instance, Operation: OperationRazorgore, Version: 2, OperationID: uuid.New(), TenantID: f.tenant, Warnings: []byte(`[]`), Details: []byte(`{}`)})
	require.ErrorIs(t, err, pgx.ErrNoRows, "version changes must not bypass the script guard")
	// Deleting ephemeral audit history must not erase permanent provenance.
	_, err = f.pool.Exec(f.ctx, `DELETE FROM event_repair_operations WHERE id=$1`, f.id)
	require.NoError(t, err)
	receipts, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	next := anotherReceiptJob(t, f, instance)
	_, err = f.service.ProcessPage(f.ctx, next, "dry_running")
	require.NoError(t, err)
	report, err := f.service.Get(f.ctx, next)
	require.NoError(t, err)
	require.Equal(t, "skipped", report.Items[0].State)
	require.Contains(t, report.Items[0].Reason, "permanent receipt")
	_, err = f.service.Apply(f.ctx, next, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.ProcessPage(f.ctx, next, "applying")
	require.NoError(t, err)
	require.Equal(t, 1, f.canonicalJobs(t))
}
func TestReceiptRollsBackWithApplyFailure(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	instance := receiptInstance(t, f)
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error {
		return errors.New("source write failed")
	}
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.ErrorContains(t, err, "source write failed")
	rows, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, rows)
	require.Zero(t, f.canonicalJobs(t))
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error { return nil }
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	rows, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, rows, 1)
}
func TestReceiptConcurrentJobsApplyOnlyOnce(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	instance := receiptInstance(t, f)
	other := anotherReceiptJob(t, f, instance)
	for _, id := range []uuid.UUID{f.id, other} {
		_, err := f.service.ProcessPage(f.ctx, id, "dry_running")
		require.NoError(t, err)
		_, err = f.service.Apply(f.ctx, id, uuid.New())
		require.NoError(t, err)
	}
	// Force both SERIALIZABLE snapshots to observe no receipt before either inserts.
	// No timing assumptions: the barrier is explicit and bounded by the test context.
	var arrived atomic.Int32
	gate := make(chan struct{})
	var applies atomic.Int32
	f.service.jobs[OperationRazorgore].revalidate = func(ctx context.Context, _ database.Store, _ *RazorgoreRepairPlan) error {
		if arrived.Add(1) == 2 {
			close(gate)
		}
		select {
		case <-gate:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	f.service.jobs[OperationRazorgore].apply = func(context.Context, database.Store, *RazorgoreRepairPlan) error { applies.Add(1); return nil }
	ids := []uuid.UUID{f.id, other}
	errs := make([]error, 2)
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		go func() { defer wg.Done(); _, errs[i] = f.service.ProcessPage(f.ctx, id, "applying") }()
	}
	wg.Wait()
	f.service.jobs[OperationRazorgore].revalidate = func(context.Context, database.Store, *RazorgoreRepairPlan) error { return nil }
	for i, err := range errs {
		if err != nil {
			var pgerr *pgconn.PgError
			require.ErrorAs(t, err, &pgerr)
			require.Equal(t, "40001", pgerr.Code)
			_, err = f.service.ProcessPage(f.ctx, ids[i], "applying")
			require.NoError(t, err)
		}
	}
	require.EqualValues(t, 1, applies.Load())
	require.Equal(t, 1, f.canonicalJobs(t))
	rows, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, rows, 1)
}
func TestReceiptTenantVisibilityAndInstanceDeletion(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	instance := receiptInstance(t, f)
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	// Use a fresh non-bypass context; WithTenantID must not inherit admin bypass.
	own := servicetenant.WithTenantID(testutil.Context(t, testutil.WaitLong), f.tenant)
	rows, err := f.db.ListInstanceEventRepairReceipts(own, instance)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	_, err = f.pool.Exec(f.ctx, `UPDATE tenants SET include_in_all=false WHERE id=$1`, f.tenant)
	require.NoError(t, err)
	rootRows, err := f.db.ListInstanceEventRepairReceipts(testutil.Context(t, testutil.WaitLong), instance)
	require.NoError(t, err)
	require.Empty(t, rootRows, "aggregate root must not expose hidden-tenant receipts")
	other := servicetenant.WithTenantID(testutil.Context(t, testutil.WaitLong), uuid.New())
	rows, err = f.db.ListInstanceEventRepairReceipts(other, instance)
	require.NoError(t, err)
	require.Empty(t, rows)
	_, err = f.db.InsertEventRepairReceipt(other, database.InsertEventRepairReceiptParams{InstanceID: instance, Operation: "other-script", Version: 1, OperationID: uuid.New(), TenantID: f.tenant, Warnings: []byte(`[]`), Details: []byte(`{}`)})
	require.Error(t, err)
	_, err = f.pool.Exec(f.ctx, `DELETE FROM log_instances WHERE id=$1`, instance)
	require.NoError(t, err)
	rows, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, rows)
}
func TestReceiptCoveredByEvidenceAndPlanSeal(t *testing.T) {
	t.Parallel()
	store := &razorgoreStore{e: fixtureRazorgore(t)}
	ctx := context.Background()
	p, err := EvaluateRazorgore(ctx, store, store.e.Instance.ID)
	require.NoError(t, err)
	store.e.Receipts = []database.EventRepairReceipt{{InstanceID: store.e.Instance.ID, Operation: OperationRazorgore, Version: 1, OperationID: uuid.New()}}
	require.ErrorIs(t, RevalidateRazorgore(ctx, store, p), ErrStaleEvidence)
	skipped, err := EvaluateRazorgore(ctx, store, store.e.Instance.ID)
	require.NoError(t, err)
	require.True(t, skipped.RequiresReparse)
	require.Contains(t, skipped.Reason, "permanent receipt")
	p.Warnings = []string{"modified"}
	require.ErrorContains(t, validateRazorgorePlan(p), "modified")
	p, err = EvaluateRazorgore(ctx, store, store.e.Instance.ID)
	require.NoError(t, err)
	p.Details = map[string]any{"secret": "modified"}
	require.ErrorContains(t, validateRazorgorePlan(p), "modified")
	_, err = json.Marshal(p)
	require.NoError(t, err)
}
