package serviceratings

import (
	"context"
	"errors"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
)

type ArgsOperationDispatch struct {
	AfterTenant uuid.UUID `json:"after_tenant"`
}

func (ArgsOperationDispatch) Kind() string                 { return "leaderboard-operation-dispatch" }
func (ArgsOperationDispatch) InsertOpts() river.InsertOpts { return insertOptions() }

type ArgsOperationPage struct {
	TenantID    uuid.UUID `json:"tenant_id"`
	OperationID uuid.UUID `json:"operation_id"`
}

func (ArgsOperationPage) Kind() string                 { return "leaderboard-operation-page" }
func (ArgsOperationPage) InsertOpts() river.InsertOpts { return insertOptions() }

type OperationDispatcher struct {
	river.WorkerDefaults[ArgsOperationDispatch]
	Store database.Store
	Queue JobInserter
}

func (d *OperationDispatcher) Work(ctx context.Context, j *river.Job[ArgsOperationDispatch]) error {
	rows, err := d.Store.ListDueLeaderboardOperations(servicetenant.AdminBypass(ctx), j.Args.AfterTenant)
	if err != nil {
		return err
	}
	for _, r := range rows {
		if _, err = d.Queue.Insert(ctx, ArgsOperationPage{TenantID: r.TenantID, OperationID: r.ID}, nil); err != nil {
			return err
		}
	}
	if len(rows) == 100 {
		_, err = d.Queue.Insert(ctx, ArgsOperationDispatch{AfterTenant: rows[99].TenantID}, nil)
	}
	return err
}

type OperationWorker struct {
	Metrics *Metrics
	Queue   JobInserter
	river.WorkerDefaults[ArgsOperationPage]
	Store database.Store
}

func (*OperationWorker) Timeout(*river.Job[ArgsOperationPage]) time.Duration { return WorkTimeout }
func (w *OperationWorker) Work(ctx context.Context, j *river.Job[ArgsOperationPage]) error {
	ctx = servicetenant.WithTenantID(ctx, j.Args.TenantID)
	ctx, cancel := context.WithTimeout(ctx, WorkTimeout)
	defer cancel()
	worked := false
	ready := func(ctx context.Context) (bool, error) {
		op, err := w.Store.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: j.Args.OperationID, TenantID: j.Args.TenantID})
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return err == nil && op.State == "discovering", err
	}
	err := continueWork(ctx, func(ctx context.Context) (bool, error) {
		op, lookupErr := w.Store.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: j.Args.OperationID, TenantID: j.Args.TenantID})
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return false, nil
		}
		if lookupErr != nil {
			return false, lookupErr
		}
		if op.State == "paused" || op.State == "completed" {
			return false, nil
		}
		if err := w.Step(ctx, j.Args.TenantID, j.Args.OperationID); err != nil {
			return false, err
		}
		worked = worked || op.State == "discovering"
		discovering, err := ready(ctx)
		worked = worked || discovering
		return discovering, err
	}, ready)
	if err == nil && worked {
		// One final completion check after discovery exhaustion; never loop while
		// draining is blocked by durable D1/D2 work.
		op, lookupErr := w.Store.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: j.Args.OperationID, TenantID: j.Args.TenantID})
		if lookupErr != nil && !errors.Is(lookupErr, pgx.ErrNoRows) {
			err = lookupErr
		} else if lookupErr == nil && op.State == "draining" {
			err = w.Step(ctx, j.Args.TenantID, j.Args.OperationID)
		}
	}
	if worked {
		nudgeDownstream(ctx, w.Queue, w.Metrics, j.Args.TenantID, true)
	}
	if err == nil && w.Queue != nil {
		current, readErr := w.Store.GetLeaderboardOperation(ctx, database.GetLeaderboardOperationParams{ID: j.Args.OperationID, TenantID: j.Args.TenantID})
		if readErr == nil && current.State == "completed" {
			_, enqueueErr := w.Queue.Insert(ctx, ArgsHighlightDispatch{TenantID: j.Args.TenantID}, nil)
			outcome := "success"
			if enqueueErr != nil {
				outcome = "failed"
			}
			w.Metrics.event(j.Args.TenantID, "highlights", "dispatch_nudge", outcome, 1)
		}
	}
	var snooze *river.JobSnoozeError
	if err != nil && !errors.As(err, &snooze) {
		cleanup, cancel := context.WithTimeout(servicetenant.WithTenantID(context.WithoutCancel(ctx), j.Args.TenantID), 5*time.Second)
		defer cancel()
		_ = w.Store.RetryLeaderboardOperation(cleanup, database.RetryLeaderboardOperationParams{ID: j.Args.OperationID, TenantID: j.Args.TenantID, LastError: err.Error()})
	}
	return err
}
func (w *OperationWorker) Step(ctx context.Context, tenant, id uuid.UUID) error {
	if servicetenant.IsBypass(ctx) {
		return errors.New("operation page requires tenant context, not admin bypass")
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	start := time.Now()
	phase := ""
	err := w.Store.InTx(ctx, func(tx database.Store) error {
		op, err := tx.LockLeaderboardOperation(ctx, database.LockLeaderboardOperationParams{ID: id, TenantID: tenant})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if op.State == "paused" || op.State == "completed" {
			return nil
		}
		phase = op.Phase
		if op.State == "draining" {
			phase = "drain"
		}
		if op.State == "draining" {
			return tx.CompleteLeaderboardOperation(ctx, database.CompleteLeaderboardOperationParams{ID: id, TenantID: tenant})
		}
		if op.Scope == "run" {
			if err := tx.EnqueueLeaderboardRun(ctx, database.EnqueueLeaderboardRunParams{TenantID: tenant, RunID: op.RunID.UUID, ProcessAfter: database.Timestamptz(time.Now())}); err != nil {
				return err
			}
			if err := tx.AdvanceLeaderboardOperation(ctx, database.AdvanceLeaderboardOperationParams{ID: id, TenantID: tenant, CursorRealm: op.CursorRealm, CursorDate: op.CursorDate, CursorID: op.RunID.UUID, Phase: "runs", PageCount: 1}); err != nil {
				return err
			}
			return tx.DrainLeaderboardOperation(ctx, database.DrainLeaderboardOperationParams{ID: id, TenantID: tenant})
		}
		if op.Phase != "runs" {
			return operationRepairPhase(ctx, tx, op)
		}
		if op.CursorRealm == uuid.Nil {
			missing, err := tx.CountLeaderboardOperationMissingDates(ctx, tenant)
			if err != nil {
				return err
			}
			if err = tx.SetLeaderboardOperationMissingDates(ctx, database.SetLeaderboardOperationMissingDatesParams{ID: id, TenantID: tenant, MissingDates: missing}); err != nil {
				return err
			}
			realm, err := tx.NextLeaderboardOperationRealm(ctx, database.NextLeaderboardOperationRealmParams{TenantID: tenant, AfterRealm: uuid.Nil})
			if errors.Is(err, pgx.ErrNoRows) {
				return tx.AdvanceLeaderboardOperationPhase(ctx, database.AdvanceLeaderboardOperationPhaseParams{ID: id, TenantID: tenant, Phase: "evidence"})
			}
			if err != nil {
				return err
			}
			op.CursorRealm = realm
		}
		rangeStart := pgtype.Timestamptz{}
		if op.AfterDate.Valid {
			rangeStart = database.Timestamptz(op.AfterDate.Time)
		}
		rows, err := tx.DiscoverLeaderboardOperationRuns(ctx, database.DiscoverLeaderboardOperationRunsParams{TenantID: tenant, RealmID: op.CursorRealm, RangeStart: rangeStart, BeforeTime: database.Timestamptz(op.BeforeDate.Time), AfterDate: op.CursorDate, AfterID: op.CursorID})
		if err != nil {
			return err
		}
		for _, r := range rows {
			if err = tx.EnqueueLeaderboardRun(ctx, database.EnqueueLeaderboardRunParams{TenantID: tenant, RunID: r.RunID, ProcessAfter: database.Timestamptz(time.Now())}); err != nil {
				return err
			}
		}
		if len(rows) > 0 {
			last := rows[len(rows)-1]
			op.CursorDate = last.EndTime
			op.CursorID = last.RunID
		} else {
			realm, err := tx.NextLeaderboardOperationRealm(ctx, database.NextLeaderboardOperationRealmParams{TenantID: tenant, AfterRealm: op.CursorRealm})
			if errors.Is(err, pgx.ErrNoRows) {
				return tx.AdvanceLeaderboardOperationPhase(ctx, database.AdvanceLeaderboardOperationPhaseParams{ID: id, TenantID: tenant, Phase: "evidence"})
			}
			if err != nil {
				return err
			}
			op.CursorRealm = realm
			op.CursorDate = pgtype.Timestamptz{InfinityModifier: pgtype.NegativeInfinity, Valid: true}
			op.CursorID = uuid.Nil
		}
		return tx.AdvanceLeaderboardOperation(ctx, database.AdvanceLeaderboardOperationParams{ID: id, TenantID: tenant, CursorRealm: op.CursorRealm, CursorDate: op.CursorDate, CursorID: op.CursorID, Phase: "runs", PageCount: int64(len(rows))})
	}, nil)
	if phase != "" {
		phase = metricOperationPhase(phase)
		w.Metrics.elapsed(tenant, "operation", phase, start, err)
		if err == nil {
			w.Metrics.event(tenant, "operation", phase, "committed_page", 1)
		}
	}
	return err
}

var operationResultPhases = []string{"player_boss_benchmarks", "player_boss_subjects", "guild_boss_benchmarks", "guild_boss_subjects", "guild_clear_benchmarks", "guild_clear_subjects", "player_renown_counts", "guild_renown_counts", "variant_player_boss_benchmarks", "variant_player_boss_subjects", "variant_guild_boss_benchmarks", "variant_guild_boss_subjects"}

func operationRepairPhase(ctx context.Context, tx database.Store, op database.LeaderboardOperation) error {
	tenant, id := op.TenantID, op.ID
	if op.Phase == "evidence" {
		rows, err := tx.DiscoverLeaderboardOperationEvidence(ctx, database.DiscoverLeaderboardOperationEvidenceParams{TenantID: tenant, Cutoff: op.Cutoff, AfterID: op.CursorID})
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return tx.AdvanceLeaderboardOperationPhase(ctx, database.AdvanceLeaderboardOperationPhaseParams{ID: id, TenantID: tenant, Phase: operationResultPhases[0]})
		}
		for _, run := range rows {
			if err = tx.EnqueueLeaderboardRun(ctx, database.EnqueueLeaderboardRunParams{TenantID: tenant, RunID: run, ProcessAfter: database.Timestamptz(time.Now())}); err != nil {
				return err
			}
		}
		return tx.AdvanceLeaderboardOperation(ctx, database.AdvanceLeaderboardOperationParams{ID: id, TenantID: tenant, CursorRealm: op.CursorRealm, CursorDate: op.CursorDate, CursorID: rows[len(rows)-1], Phase: "evidence", PageCount: int64(len(rows))})
	}
	var count int64
	var cursor []byte
	var err error
	switch op.Phase {
	case "player_boss_benchmarks":
		r, e := tx.RepairOperationPlayerBossBenchmarks(ctx, database.RepairOperationPlayerBossBenchmarksParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "player_boss_subjects":
		r, e := tx.RepairOperationPlayerBossSubjects(ctx, database.RepairOperationPlayerBossSubjectsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "guild_boss_benchmarks":
		r, e := tx.RepairOperationGuildBossBenchmarks(ctx, database.RepairOperationGuildBossBenchmarksParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "guild_boss_subjects":
		r, e := tx.RepairOperationGuildBossSubjects(ctx, database.RepairOperationGuildBossSubjectsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "variant_player_boss_benchmarks":
		r, e := tx.RepairOperationVariantPlayerBossBenchmarks(ctx, database.RepairOperationVariantPlayerBossBenchmarksParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "variant_player_boss_subjects":
		r, e := tx.RepairOperationVariantPlayerBossSubjects(ctx, database.RepairOperationVariantPlayerBossSubjectsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "variant_guild_boss_benchmarks":
		r, e := tx.RepairOperationVariantGuildBossBenchmarks(ctx, database.RepairOperationVariantGuildBossBenchmarksParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "variant_guild_boss_subjects":
		r, e := tx.RepairOperationVariantGuildBossSubjects(ctx, database.RepairOperationVariantGuildBossSubjectsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "guild_clear_benchmarks":
		r, e := tx.RepairOperationGuildClearBenchmarks(ctx, database.RepairOperationGuildClearBenchmarksParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "guild_clear_subjects":
		r, e := tx.RepairOperationGuildClearSubjects(ctx, database.RepairOperationGuildClearSubjectsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "player_renown_counts":
		r, e := tx.RepairOperationPlayerRenownCounts(ctx, database.RepairOperationPlayerRenownCountsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e
	case "guild_renown_counts":
		r, e := tx.RepairOperationGuildRenownCounts(ctx, database.RepairOperationGuildRenownCountsParams{TenantID: tenant, Cutoff: op.Cutoff, CursorScope: op.CursorScope})
		count, cursor, err = r.PageCount, r.LastCursor, e

	default:
		return errors.New("unknown leaderboard operation phase")
	}
	if err != nil {
		return err
	}
	if count > 0 {
		return tx.AdvanceLeaderboardOperationScope(ctx, database.AdvanceLeaderboardOperationScopeParams{ID: id, TenantID: tenant, CursorScope: cursor, PageCount: count})
	}
	for i, phase := range operationResultPhases {
		if phase == op.Phase {
			if i+1 == len(operationResultPhases) {
				return tx.DrainLeaderboardOperation(ctx, database.DrainLeaderboardOperationParams{ID: id, TenantID: tenant})
			}
			return tx.AdvanceLeaderboardOperationPhase(ctx, database.AdvanceLeaderboardOperationPhaseParams{ID: id, TenantID: tenant, Phase: operationResultPhases[i+1]})
		}
	}
	return nil
}

func metricOperationPhase(phase string) string {
	if phase == "runs" || phase == "evidence" || phase == "drain" {
		return phase
	}
	for _, known := range operationResultPhases {
		if known == phase {
			return phase
		}
	}
	return "unknown"
}
