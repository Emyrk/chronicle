package servicerankings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const peakExpiryPageSize int32 = 200

type ArgsExpireTenantPeak struct {
	TenantID        uuid.UUID `json:"tenant_id"`
	AsOf            time.Time `json:"as_of"`
	AfterKind       string    `json:"after_kind"`
	AfterInstance   string    `json:"after_instance"`
	AfterBoss       string    `json:"after_boss"`
	AfterDifficulty string    `json:"after_difficulty"`
	AfterSize       int16     `json:"after_size"`
	AfterClass      string    `json:"after_class"`
	AfterSpec       string    `json:"after_spec"`
	AfterSubSpec    string    `json:"after_sub_spec"`
	AfterMetric     string    `json:"after_metric"`
}

func (ArgsExpireTenantPeak) Kind() string { return "expire-tenant-peak" }
func (ArgsExpireTenantPeak) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerExpireTenantPeak struct {
	river.WorkerDefaults[ArgsExpireTenantPeak]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerExpireTenantPeak) Work(ctx context.Context, job *river.Job[ArgsExpireTenantPeak]) error {
	args := job.Args
	if args.AsOf.IsZero() {
		return fmt.Errorf("peak expiry requires a fixed cutoff")
	}
	if args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	rows, err := w.Store.ListPeakCohortExpiryPage(ctx, database.ListPeakCohortExpiryPageParams{
		TenantID: args.TenantID, PeriodStart: database.Timestamptz(args.AsOf.AddDate(0, 0, -180)),
		AfterSubjectKind: args.AfterKind, AfterInstanceName: args.AfterInstance,
		AfterEncounterName: args.AfterBoss, AfterDifficultyName: args.AfterDifficulty,
		AfterMaxPlayers: args.AfterSize, AfterPlayerClass: args.AfterClass,
		AfterPlayerSpec: args.AfterSpec, AfterPlayerSubSpec: args.AfterSubSpec,
		AfterPerformanceMetric: args.AfterMetric, BatchSize: peakExpiryPageSize,
	})
	if err != nil {
		return err
	}
	for _, row := range rows {
		if err := w.Store.MarkDirtyPeakCohort(ctx, database.MarkDirtyPeakCohortParams{
			TenantID: args.TenantID, SubjectKind: row.SubjectKind,
			InstanceName: row.InstanceName, EncounterName: row.EncounterName,
			DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers,
			PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec,
			PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric,
		}); err != nil {
			return err
		}
	}
	if len(rows) < int(peakExpiryPageSize) {
		return nil
	}
	if w.Queue == nil {
		return fmt.Errorf("peak expiry queue unavailable")
	}
	last := rows[len(rows)-1]
	next := ArgsExpireTenantPeak{
		TenantID: args.TenantID, AsOf: args.AsOf,
		AfterKind: last.SubjectKind, AfterInstance: last.InstanceName,
		AfterBoss: last.EncounterName, AfterDifficulty: last.DifficultyName,
		AfterSize: last.MaxPlayers, AfterClass: last.PlayerClass,
		AfterSpec: last.PlayerSpec, AfterSubSpec: last.PlayerSubSpec,
		AfterMetric: last.PerformanceMetric,
	}
	_, err = w.Queue.Insert(ctx, next, nil)
	return err
}

type ArgsDispatchPeakExpiry struct{}

func (ArgsDispatchPeakExpiry) Kind() string { return "dispatch-peak-expiry" }
func (ArgsDispatchPeakExpiry) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchPeakExpiry struct {
	river.WorkerDefaults[ArgsDispatchPeakExpiry]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchPeakExpiry) Work(ctx context.Context, _ *river.Job[ArgsDispatchPeakExpiry]) error {
	if w.Queue == nil {
		return fmt.Errorf("peak expiry queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListRatingTenants(ctx)
	if err != nil {
		return err
	}
	asOf := time.Now().UTC()
	for _, tenant := range tenants {
		if !tenant.Valid {
			return fmt.Errorf("rating tenant enumeration returned null")
		}
		if _, err := w.Queue.Insert(ctx, ArgsExpireTenantPeak{TenantID: tenant.UUID, AsOf: asOf}, nil); err != nil {
			return err
		}
	}
	return nil
}
