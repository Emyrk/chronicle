package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const TimeParseScoreLookbackDays int16 = 60

const (
	TimeParseScopeServer = "server"
	TimeParseScopeRealm  = "realm"
	TimeParseScopeGuild  = "guild"
)

type WorkerComputeTimeParseScores struct {
	river.WorkerDefaults[parseargs.ArgsComputeTimeParseScores]
	Store  database.Store
	Logger *slog.Logger
}

func lockedTimeParseCutoff(value string, now time.Time) (time.Time, error) {
	if value == "" {
		now = now.UTC()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, fmt.Errorf("cutoff_date must use YYYY-MM-DD: %w", err)
	}
	return parsed.UTC(), nil
}

func (w *WorkerComputeTimeParseScores) Work(ctx context.Context, job *river.Job[parseargs.ArgsComputeTimeParseScores]) error {
	args := job.Args
	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	cutoff, err := lockedTimeParseCutoff(args.CutoffDate, time.Now())
	if err != nil {
		return river.JobCancel(err)
	}
	windowStart := cutoff.AddDate(0, 0, -int(TimeParseScoreLookbackDays))
	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion

	return w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireTimeParseScoreLock(ctx, args.InstanceID.String()); err != nil {
			return fmt.Errorf("acquire time parse score lock: %w", err)
		}
		if !args.Force {
			_, err = tx.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{
				TenantID: args.TenantID, InstanceID: args.InstanceID, LookbackDays: TimeParseScoreLookbackDays,
				PolicyVersion: policyVersion, QueryVersion: queryVersion,
			})
			if err == nil {
				return nil
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("get existing time parse receipt: %w", err)
			}
		}

		instance, err := tx.GetTimeParseScoringInstance(ctx, database.GetTimeParseScoringInstanceParams{
			ID: args.InstanceID, TenantID: uuid.NullUUID{UUID: args.TenantID, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return river.JobCancel(fmt.Errorf("instance %s not found, invalidated, or outside tenant", args.InstanceID))
			}
			return fmt.Errorf("get time parse scoring instance: %w", err)
		}
		speedrun, speedrunErr := tx.GetInstanceSpeedrun(ctx, args.InstanceID)
		if speedrunErr != nil && !errors.Is(speedrunErr, pgx.ErrNoRows) {
			return fmt.Errorf("get instance speedrun: %w", speedrunErr)
		}
		bossKills, err := tx.GetInstanceCleanEncounterKillTimes(ctx, args.InstanceID)
		if err != nil {
			return fmt.Errorf("get boss kill times: %w", err)
		}

		type scoreRow struct {
			scope, metricKind, encounterName string
			encounterID                      uuid.NullUUID
			duration                         int64
			result                           timeparsepolicy.ScoreResult
		}
		scopes := []string{TimeParseScopeServer, TimeParseScopeRealm}
		if instance.GuildID.Valid {
			scopes = append(scopes, TimeParseScopeGuild)
		}
		rows := make([]scoreRow, 0, len(scopes)*(len(bossKills)+1))
		cutoffDB := pgtype.Timestamptz{Time: cutoff, Valid: true}
		windowDB := pgtype.Timestamptz{Time: windowStart, Valid: true}
		guildFilter := uuid.Nil
		if instance.GuildID.Valid {
			guildFilter = instance.GuildID.UUID
		}
		for _, scope := range scopes {
			if speedrunErr == nil && speedrun.Qualified && speedrun.RankedDurationMs.Valid && speedrun.RankedDurationMs.Int64 > 0 {
				cohort, cohortErr := tx.GetScopedTimeParseClearTimeCohort(ctx, database.GetScopedTimeParseClearTimeCohortParams{
					TenantID: args.TenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
					Cutoff: cutoffDB, WindowStart: windowDB, ExcludeRunID: instance.RunID,
					InstanceName: speedrun.InstanceName, DifficultyName: instance.DifficultyName,
					MaxPlayers: int16(instance.MaxPlayers), Scope: scope, RealmID: instance.RealmID, GuildID: guildFilter,
				})
				if cohortErr != nil {
					return fmt.Errorf("load %s clear cohort: %w", scope, cohortErr)
				}
				result, _ := timeparsepolicy.ScoreTime(cohort, speedrun.RankedDurationMs.Int64)
				rows = append(rows, scoreRow{scope: scope, metricKind: "clear_time", duration: speedrun.RankedDurationMs.Int64, result: result})
			}
			for _, kill := range bossKills {
				if kill.DurationMs <= 0 {
					continue
				}
				cohort, cohortErr := tx.GetScopedTimeParseBossKillCohort(ctx, database.GetScopedTimeParseBossKillCohortParams{
					TenantID: args.TenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
					Cutoff: cutoffDB, WindowStart: windowDB, ExcludeRunID: instance.RunID,
					InstanceName: instance.InstanceName, EncounterName: kill.EncounterName,
					DifficultyName: instance.DifficultyName, MaxPlayers: int16(instance.MaxPlayers),
					Scope: scope, RealmID: instance.RealmID, GuildID: guildFilter,
				})
				if cohortErr != nil {
					return fmt.Errorf("load %s boss cohort %q: %w", scope, kill.EncounterName, cohortErr)
				}
				result, _ := timeparsepolicy.ScoreTime(cohort, kill.DurationMs)
				rows = append(rows, scoreRow{scope: scope, metricKind: "boss_kill", encounterID: uuid.NullUUID{UUID: kill.EncounterID, Valid: true}, encounterName: kill.EncounterName, duration: kill.DurationMs, result: result})
			}
		}

		if err := tx.DeleteTimeParseScoreReceiptForContract(ctx, database.DeleteTimeParseScoreReceiptForContractParams{
			TenantID: args.TenantID, InstanceID: args.InstanceID, LookbackDays: TimeParseScoreLookbackDays,
			PolicyVersion: policyVersion, QueryVersion: queryVersion,
		}); err != nil {
			return fmt.Errorf("delete old time parse receipt: %w", err)
		}
		receipt, err := tx.InsertTimeParseScoreReceipt(ctx, database.InsertTimeParseScoreReceiptParams{
			TenantID: args.TenantID, InstanceID: args.InstanceID, RunID: instance.RunID,
			LogGroupID: uuid.NullUUID{UUID: instance.LogGroupID, Valid: true}, RealmID: instance.RealmID,
			GuildID: instance.GuildID, Cutoff: cutoffDB, WindowStart: windowDB,
			LookbackDays: TimeParseScoreLookbackDays, PolicyVersion: policyVersion, QueryVersion: queryVersion,
			SourceCount: int32(len(bossKills)) + boolInt32(speedrunErr == nil && speedrun.Qualified), ResultCount: int32(len(rows)),
		})
		if err != nil {
			return fmt.Errorf("insert time parse receipt: %w", err)
		}
		for _, row := range rows {
			if err := tx.InsertTimeParseScoreResult(ctx, database.InsertTimeParseScoreResultParams{
				ReceiptID: receipt.ID, TenantID: args.TenantID, InstanceID: args.InstanceID, RunID: instance.RunID,
				LogGroupID: uuid.NullUUID{UUID: instance.LogGroupID, Valid: true}, RealmID: instance.RealmID, GuildID: instance.GuildID,
				Scope: row.scope, MetricKind: row.metricKind, EncounterID: row.encounterID, EncounterName: row.encounterName,
				DurationMs: row.duration, PreciseScore: row.result.PreciseScore, DisplayScore: int16(row.result.DisplayScore),
				Rank: int32(row.result.Rank), SampleSize: int32(row.result.SampleSize), Status: string(row.result.Status),
				Cutoff: cutoffDB, WindowStart: windowDB, LookbackDays: TimeParseScoreLookbackDays,
				PolicyVersion: policyVersion, QueryVersion: queryVersion,
			}); err != nil {
				return fmt.Errorf("insert time parse score: %w", err)
			}
		}
		return nil
	}, nil)
}

func boolInt32(value bool) int32 {
	if value {
		return 1
	}
	return 0
}

const KindBackfillTimeParseScores = "backfill-time-parse-scores"

// Manually enqueue from River UI with kind "backfill-time-parse-scores" and
// args {} to dispatch the next 100 missing historical instances across all
// tenants. Optional args: tenant_id, started_after/started_before (RFC3339),
// cutoff_date (YYYY-MM-DD), batch_size (max 500), and force.
type ArgsBackfillTimeParseScores struct {
	TenantID      *uuid.UUID `json:"tenant_id,omitempty"`
	StartedAfter  string     `json:"started_after,omitempty"`
	StartedBefore string     `json:"started_before,omitempty"`
	CutoffDate    string     `json:"cutoff_date,omitempty"`
	BatchSize     int32      `json:"batch_size,omitempty"`
	Force         bool       `json:"force,omitempty"`
}

func (ArgsBackfillTimeParseScores) Kind() string { return KindBackfillTimeParseScores }
func (ArgsBackfillTimeParseScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{rivertype.JobStatePending, rivertype.JobStateAvailable, rivertype.JobStateRunning}}}
}

type WorkerBackfillTimeParseScores struct {
	river.WorkerDefaults[ArgsBackfillTimeParseScores]
	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func parseOptionalDate(value string) (pgtype.Timestamptz, error) {
	if value == "" {
		return pgtype.Timestamptz{}, nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return pgtype.Timestamptz{}, fmt.Errorf("date must use RFC3339: %w", err)
	}
	return pgtype.Timestamptz{Time: parsed, Valid: true}, nil
}
func (w *WorkerBackfillTimeParseScores) Work(ctx context.Context, job *river.Job[ArgsBackfillTimeParseScores]) error {
	if w.Queue == nil {
		return river.JobCancel(errors.New("queue unavailable"))
	}
	after, err := parseOptionalDate(job.Args.StartedAfter)
	if err != nil {
		return river.JobCancel(err)
	}
	before, err := parseOptionalDate(job.Args.StartedBefore)
	if err != nil {
		return river.JobCancel(err)
	}
	batch := job.Args.BatchSize
	if batch <= 0 {
		batch = 100
	}
	if batch > 500 {
		batch = 500
	}
	tenantFilter := uuid.Nil
	allTenants := job.Args.TenantID == nil
	if job.Args.TenantID != nil {
		tenantFilter = *job.Args.TenantID
	}
	ctx = servicetenant.AdminBypass(ctx)
	missing, err := w.Store.ListInstancesMissingTimeParseScores(ctx, database.ListInstancesMissingTimeParseScoresParams{
		AllTenants: allTenants, TenantFilter: uuid.NullUUID{UUID: tenantFilter, Valid: !allTenants}, StartedAfter: after, StartedBefore: before,
		Force: job.Args.Force, LookbackDays: TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion,
		QueryVersion: timeparsepolicy.QueryVersion, MaxRows: batch,
	})
	if err != nil {
		return fmt.Errorf("list missing time parse scores: %w", err)
	}
	enqueued := 0
	for _, candidate := range missing {
		tenantID := uuid.Nil
		if candidate.TenantID.Valid {
			tenantID = candidate.TenantID.UUID
		}
		_, insertErr := w.Queue.Insert(ctx, parseargs.ArgsComputeTimeParseScores{
			InstanceID: candidate.InstanceID, TenantID: tenantID, Force: job.Args.Force, CutoffDate: job.Args.CutoffDate,
		}, nil)
		if insertErr != nil {
			w.Logger.Error("enqueue time parse backfill instance", "instance_id", candidate.InstanceID, "error", insertErr)
			continue
		}
		enqueued++
	}
	_ = river.RecordOutput(ctx, map[string]any{"candidates": len(missing), "enqueued": enqueued, "batch_size": batch, "rerun": len(missing) == int(batch)})
	return nil
}
