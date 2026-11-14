package serviceeventrepair

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLucifronInferenceWarningPersistsThroughReceipt(t *testing.T) {
	t.Parallel()
	assertLucifronWarningsPersist(t, fixtureLucifronStableOwner(t), []string{"Stable recorded-owner inference"}, 1)
}

func TestLucifronZeroEventWarningsPersistThroughReceipt(t *testing.T) {
	t.Parallel()
	assertLucifronWarningsPersist(t, fixtureLucifronZeroEvents(t), []string{"Skipped 1 invalid-GUID damage records", "Skipped 2 harmless zero-entity classification records"}, 0)
}

func assertLucifronWarningsPersist(t *testing.T, e razorgoreEvidence, warnings []string, expectedWrites int) {
	t.Helper()
	f := lucifronLifecycleFixture(t, 1)
	instance := receiptInstance(t, f)
	e.Instance.ID = instance
	e.Server.TenantID.UUID = f.tenant
	for i := range e.Encounters {
		e.Encounters[i].InstanceID = instance
	}
	for i := range e.Events {
		e.Events[i].InstanceID = instance
	}
	for i := range e.Rankings {
		e.Rankings[i].InstanceID = instance
	}
	original, err := json.Marshal(e)
	require.NoError(t, err)
	store := &lucifronStore{razorgoreStore: &razorgoreStore{e: e}, affected: 1}
	job := f.service.jobs[OperationLucifron]
	job.evaluate = func(ctx context.Context, _ database.Store, id uuid.UUID) (*RepairPlan, error) {
		return EvaluateLucifron(ctx, store, id)
	}
	job.revalidate = func(ctx context.Context, _ database.Store, p *RepairPlan) error {
		return RevalidateLucifron(ctx, store, p)
	}
	job.apply = func(ctx context.Context, _ database.Store, p *RepairPlan) error { return ApplyLucifron(ctx, store, p) }
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	preview, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "ready", preview.State)
	require.Len(t, preview.Items[0].Warnings, len(warnings))
	for i, warning := range warnings {
		require.Contains(t, preview.Items[0].Warnings[i], warning)
	}
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, receipts)
	require.Zero(t, f.canonicalJobs(t))
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	report, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, "completed", report.State)
	require.Equal(t, preview.Items[0].Warnings, report.Items[0].Warnings)
	require.Len(t, store.updates, expectedWrites)
	receipts, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	expected, err := json.Marshal(preview.Items[0].Warnings)
	require.NoError(t, err)
	require.JSONEq(t, string(expected), string(receipts[0].Warnings))
	require.EqualValues(t, LucifronVersion, receipts[0].Version)
	require.Equal(t, 1, f.canonicalJobs(t))
	after, err := json.Marshal(store.e)
	require.NoError(t, err)
	require.Equal(t, original, after, "mock apply records only planned ranking writes; original evidence stays immutable")
	_, err = f.pool.Exec(f.ctx, `DELETE FROM event_repair_operations WHERE id=$1`, f.id)
	require.NoError(t, err)
	receipts, err = f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	require.JSONEq(t, string(expected), string(receipts[0].Warnings), "warning provenance outlives admin history")
}

func TestLucifronInferenceWarningIsSealed(t *testing.T) {
	t.Parallel()
	e := fixtureLucifronStableOwner(t)
	store := &lucifronStore{razorgoreStore: &razorgoreStore{e: e}, affected: 1}
	plan, err := EvaluateLucifron(context.Background(), store, e.Instance.ID)
	require.NoError(t, err)
	require.False(t, plan.RequiresReparse, plan.Reason)
	require.NotEmpty(t, plan.Warnings)
	plan.Warnings = nil
	require.ErrorContains(t, ApplyLucifron(context.Background(), store, plan), "modified")
	require.Empty(t, store.updates, "removing the inference warning invalidates executable plan")
}
