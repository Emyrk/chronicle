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
	_, err := f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET operation=$2, version=$3 WHERE id=$1`, f.id, OperationLucifron, LucifronVersion)
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
		require.EqualValues(t, f.service.jobs[operation].version, report.Version)
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
	require.EqualValues(t, LucifronVersion, receipt.Version)
	require.JSONEq(t, `[]`, string(receipt.Warnings))
	require.Equal(t, 1, f.canonicalJobs(t))
	next := anotherReceiptJob(t, f, instance)
	_, err = f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET operation=$2, version=$3 WHERE id=$1`, next, OperationLucifron, LucifronVersion)
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
	_, err := f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET version=99,last_error='failed' WHERE id=$1`, f.id)
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.Retry(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
}

func TestLucifronRankingMutationPreservesOtherFieldsAndRollsBack(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 1)
	instance := receiptInstance(t, f)
	var target database.EncounterDpsRanking
	for _, boss := range []string{"Lucifron", "Magmadar"} {
		encounter := uuid.New()
		_, err := f.pool.Exec(f.ctx, `INSERT INTO log_instance_encounters(id,instance_id,name,remaining,boss,start_time,end_time,kill_type) VALUES($1,$2,$3,'{}',true,'2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','clean')`, encounter, instance, boss)
		require.NoError(t, err)
		_, err = f.pool.Exec(f.ctx, `INSERT INTO encounter_dps_rankings(encounter_id,instance_id,encounter_name,instance_name,player_guid,player_name,realm_id,realm_name,damage_done,duration_secs,dps,killed_at,healing_done,absorbed_done,hps,player_spec,player_sub_spec,player_role,player_deaths,alive_percentage) SELECT $1,id,$2,'Molten Core','0x0000000000000001','Player',realm_id,'Realm',660,60,11,'2026-01-01T00:01:00Z',120,30,2.5,'Fire','fire','dps',1,99 FROM log_instances WHERE id=$3`, encounter, boss, instance)
		require.NoError(t, err)
	}
	before, err := f.db.RazorgoreRepairRankings(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, before, 2)
	for _, r := range before {
		if r.EncounterName == "Lucifron" {
			target = r
		}
	}
	require.NotEqual(t, uuid.Nil, target.ID)
	require.Zero(t, target.UnrankedDamageDone, "historical rows inherit the migration default, not an inferred fixture split")
	params := database.LucifronRepairRankingParams{ID: target.ID, InstanceID: instance, EncounterID: target.EncounterID.UUID, DamageDone: 400, UnrankedDamageDone: 260, Dps: 400.0 / 60}
	_, err = f.pool.Exec(f.ctx, `UPDATE log_instances SET name='Molten Core',parser_version='v1.0.172' WHERE id=$1`, instance)
	require.NoError(t, err)
	evidence, err := loadRazorgoreEvidence(f.ctx, f.db, instance)
	require.NoError(t, err)
	for _, c := range evidence.Encounters {
		if c.ID == target.EncounterID.UUID {
			evidence.Encounters = []database.LogInstanceEncounter{c}
			break
		}
	}
	blob := numericFrame(t, evidence, lucifronDamage(1, lucifronTestPlayer, lucifronTestBoss, 400), lucifronDamage(2, lucifronTestPlayer, lucifronTestHound, 260))
	_, err = f.pool.Exec(f.ctx, `INSERT INTO log_instance_events(instance_id,type,events) VALUES($1,'damage',$2)`, instance, blob)
	require.NoError(t, err)
	job := f.service.jobs[OperationLucifron]
	job.evaluate, job.revalidate, job.apply = EvaluateLucifron, RevalidateLucifron, ApplyLucifron
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.NoError(t, err)
	conn, err := f.pool.Acquire(f.ctx)
	require.NoError(t, err)
	_, err = conn.Exec(f.ctx, `RESET ROLE; ALTER TABLE river_job ADD CONSTRAINT reject_lucifron_queue CHECK (kind <> 'refresh-ranking-runs'); SET ROLE chronicle`)
	conn.Release()
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.Error(t, err)
	after, err := f.db.RazorgoreRepairRankings(f.ctx, instance)
	require.NoError(t, err)
	require.Equal(t, before, after, "failed queue must roll back actual source damage changes")
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
	require.NoError(t, err)
	require.Empty(t, receipts)
	conn, err = f.pool.Acquire(f.ctx)
	require.NoError(t, err)
	_, err = conn.Exec(f.ctx, `RESET ROLE; ALTER TABLE river_job DROP CONSTRAINT reject_lucifron_queue; SET ROLE chronicle`)
	conn.Release()
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.NoError(t, err)
	after, err = f.db.RazorgoreRepairRankings(f.ctx, instance)
	require.NoError(t, err)
	for i := range before {
		if before[i].ID == target.ID {
			before[i].DamageDone = params.DamageDone
			before[i].UnrankedDamageDone = params.UnrankedDamageDone
			before[i].Dps = params.Dps
		}
	}
	require.Equal(t, before, after, "only Lucifron ranked/unranked damage and DPS may change")
	require.Equal(t, 1, f.canonicalJobs(t))
	events, err := f.db.RazorgoreRepairEvents(f.ctx, instance)
	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, blob, events[0].Events, "stored events must remain byte-identical")
	wrong := params
	wrong.InstanceID = uuid.New()
	n, err := f.db.LucifronRepairRanking(f.ctx, wrong)
	require.NoError(t, err)
	require.Zero(t, n)
	for _, r := range after {
		if r.EncounterName == "Magmadar" {
			wrong = params
			wrong.ID, wrong.EncounterID = r.ID, r.EncounterID.UUID
			n, err = f.db.LucifronRepairRanking(f.ctx, wrong)
			require.NoError(t, err)
			require.Zero(t, n, "SQL also rejects other encounters")
		}
	}
}

func TestLucifronRealEvaluatorSkipsCompleteWithoutReceipt(t *testing.T) {
	t.Parallel()
	for _, version := range []string{"v1.0.173", "v1.0.174", "unknown", "v1.0.172"} {
		t.Run(version, func(t *testing.T) {
			t.Parallel()
			f := lucifronLifecycleFixture(t, 1)
			instance := receiptInstance(t, f)
			_, err := f.pool.Exec(f.ctx, `UPDATE log_instances SET name='Molten Core',parser_version=$2 WHERE id=$1`, instance, version)
			require.NoError(t, err)
			job := f.service.jobs[OperationLucifron]
			job.evaluate, job.revalidate, job.apply = EvaluateLucifron, RevalidateLucifron, ApplyLucifron
			_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
			require.NoError(t, err, "sealed skips must revalidate rather than retry forever")
			report, err := f.service.Get(f.ctx, f.id)
			require.NoError(t, err)
			require.Equal(t, "completed", report.State)
			require.Equal(t, "skipped", report.Items[0].State)
			require.Empty(t, report.LastError)
			if version == "v1.0.172" {
				require.Contains(t, report.Items[0].Reason, "no clean ranked Lucifron encounter")
			} else {
				require.Contains(t, report.Items[0].Reason, "parser version")
			}
			require.Zero(t, f.canonicalJobs(t))
			receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, instance)
			require.NoError(t, err)
			require.Empty(t, receipts)
		})
	}
}

func TestLucifronVersionOneCannotApplyOrRetryWithNewEvaluator(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 1)
	_, err := f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET version=1 WHERE id=$1`, f.id)
	require.NoError(t, err)
	_, err = f.service.Apply(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.pool.Exec(f.ctx, `UPDATE event_repair_operations SET state='applying',last_error='old worker failed' WHERE id=$1`, f.id)
	require.NoError(t, err)
	_, err = f.service.Retry(f.ctx, f.id, uuid.New())
	require.ErrorIs(t, err, ErrConflict)
	_, err = f.service.ProcessPage(f.ctx, f.id, "applying")
	require.ErrorIs(t, err, ErrConflict)
	require.Zero(t, f.canonicalJobs(t))
	receipts, err := f.db.ListInstanceEventRepairReceipts(f.ctx, receiptInstance(t, f))
	require.NoError(t, err)
	require.Empty(t, receipts)
}

func TestLucifronVersionOneReceiptRemainsPermanent(t *testing.T) {
	t.Parallel()
	f := lucifronLifecycleFixture(t, 1)
	instance := receiptInstance(t, f)
	_, err := f.db.InsertEventRepairReceipt(f.ctx, database.InsertEventRepairReceiptParams{InstanceID: instance, Operation: OperationLucifron, Version: 1, OperationID: uuid.New(), TenantID: f.tenant, Warnings: []byte(`[]`), Details: []byte(`{}`)})
	require.NoError(t, err)
	_, err = f.service.ProcessPage(f.ctx, f.id, "dry_running")
	require.NoError(t, err)
	report, err := f.service.Get(f.ctx, f.id)
	require.NoError(t, err)
	require.Equal(t, LucifronVersion, report.Version)
	require.Equal(t, "completed", report.State)
	require.Equal(t, "skipped", report.Items[0].State)
	require.Contains(t, report.Items[0].Reason, "permanent receipt")
	require.Zero(t, f.canonicalJobs(t))
}
