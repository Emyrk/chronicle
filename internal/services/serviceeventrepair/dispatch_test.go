package serviceeventrepair

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Dispatch tests inject only the numerical evaluator, retaining the real shared
// database lifecycle, receipt publication, and durable ratings queue.
func lucifronLifecycleFixture(t *testing.T, n int) *repairFixture {
	t.Helper()
	f := newRepairFixture(t, n)
	job := f.service.jobs[OperationLucifron]
	mock := f.service.jobs[OperationRazorgore]
	job.evaluate, job.apply, job.revalidate = mock.evaluate, mock.apply, mock.revalidate
	_, err := f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET operation=$2 WHERE id=$1`, f.id, OperationLucifron)
	require.NoError(t, err)
	return f
}

func TestRepairDispatchSelectionAndSweep(t *testing.T) {
	t.Parallel()
	f := newRepairFixture(t, 1)
	bwl := receiptInstance(t, f)
	mc := uuid.New()
	_, err := f.pool.Exec(f.ctx, `INSERT INTO log_instances(id,realm_id,log_group_id,name) SELECT $1,realm_id,log_group_id,'Molten Core' FROM log_instances WHERE id=$2`, mc, bwl)
	require.NoError(t, err)
	for operation, want := range map[string]uuid.UUID{OperationRazorgore: bwl, OperationLucifron: mc} {
		report, err := f.service.Create(f.ctx, uuid.New(), CreateRequest{Operation: operation, TenantID: f.tenant, Limit: 10})
		require.NoError(t, err)
		require.Equal(t, operation, report.Operation)
		require.Equal(t, 1, report.Version)
		require.Len(t, report.Items, 1)
		require.Equal(t, want, report.Items[0].InstanceID)
	}
	_, err = validateSelection(CreateRequest{Operation: OperationLucifron, Instance: mc.String()})
	require.NoError(t, err)
	_, err = validateSelection(CreateRequest{Operation: OperationLucifron, Limit: 10})
	require.ErrorIs(t, err, ErrInvalid)
	_, err = f.service.Create(f.ctx, uuid.New(), CreateRequest{Operation: "unknown", TenantID: f.tenant, Limit: 10})
	require.ErrorIs(t, err, ErrInvalid)
}

func TestLucifronLifecycleReceiptsAndRetry(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 1)
	instance := receiptInstance(t, f)
	// A receipt for a different script is not a same-script guard.
	_, err := f.db.InsertEventRepairReceipt(f.ctx, database.InsertEventRepairReceiptParams{InstanceID: instance, Operation: OperationRazorgore, Version: 1, OperationID: uuid.New(), TenantID: f.tenant, Warnings: []byte(`[]`), Details: []byte(`{}`)})
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	require.Zero(t, f.canonicalJobs(t))
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	job := f.service.jobs[OperationLucifron]
	job.apply = func(context.Context, database.Store, *RepairPlan) error {
		return errors.New("injected Lucifron source failure")
	}
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.ErrorContains(t, err, "injected Lucifron")
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 1, "failed apply rolls back Lucifron receipt")
	require.Zero(t, f.canonicalJobs(t))
	_, err = f.service.Retry(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	job.apply = func(context.Context, database.Store, *RepairPlan) error { return nil }
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	receipts, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 2)
	receipt, err := f.db.GetEventRepairReceipt(f.ctx, database.GetEventRepairReceiptParams{InstanceID: instance, Operation: OperationLucifron, TenantID: f.tenant})
	require.NoError(t, err)
	require.Equal(t, f.id, receipt.OperationID)
	require.EqualValues(t, 1, receipt.Version)
	require.JSONEq(t, `[]`, string(receipt.Warnings))
	require.Equal(t, 1, f.canonicalJobs(t))
	next := anotherReceiptJob(t, f, instance)
	_, err = f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET operation=$2 WHERE id=$1`, next, OperationLucifron)
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, next, "dry_running")
	require.NoError(t, err)
	report, err := f.service.Get(f.ctx, next)
	require.NoError(t, err)
	require.Equal(t, "completed", report.State)
	require.Equal(t, "skipped", report.Items[0].State)
	require.Contains(t, report.Items[0].Reason, "permanent receipt")
	require.Equal(t, 1, f.canonicalJobs(t))
}

func TestLucifronLifecycleEmptySkippedAndStale(t *testing.T) {
	t.Parallel()
	for _, state := range []string{"empty", "skipped", "stale"} {
		t.Run(state, func(t *testing.T) {
			t.Parallel()
			n := 1
			if state == "empty" {
				n = 0
			}
			f := lucifronLifecycleFixture(t, n)
			job := f.service.jobs[OperationLucifron]
			if state == "skipped" {
				job.evaluate = func(context.Context, database.Store, uuid.UUID) (*RepairPlan, error) {
					return &RepairPlan{TenantID: f.tenant, EvidenceHash: "stable", RequiresReparse: true, Reason: "parser at or after rule version"}, nil
				}
			}
			_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
			require.NoError(t, err)
			if state == "stale" {
				_, err = f.service.Apply(f.ctx, f.id, uuid.New())
				require.NoError(t, err)
				job.revalidate = func(context.Context, database.Store, *RepairPlan) error { return ErrStaleEvidence }
				_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
				require.NoError(t, err)
			}
			report, err := f.service.Get(f.ctx, f.id)
			require.NoError(t, err)
			require.Equal(t, "completed", report.State)
			require.Zero(t, f.canonicalJobs(t))
			if n > 0 {
				receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, report.Items[0].InstanceID)
				require.NoError(t, err)
				require.Empty(t, receipts)
				require.Equal(t, state, report.Items[0].State)
			}
			_, err = f.service.Apply(f.ctx, f.id, uuid.New())
			require.ErrorIs(t, err, ErrConflict)
		})
	}
}

func TestRepairDispatchRejectsUnknownVersion(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 0)
	_, err := f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET version=2,last_error='failed' WHERE id=$1`, f.id)
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.Retry(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
}
