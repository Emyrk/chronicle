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

func (w *WorkerComputeTimeParseScores) Work(ctx context.Context, job *river.Job[parseargs.ArgsComputeTimeParseScores]) error {
	args := job.Args
	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion

	return w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireTimeParseScoreLock(ctx, args.InstanceID.String()); err != nil {
			return fmt.Errorf("acquire time parse score lock: %w", err)
		}
		if !args.Force {
			_, err := tx.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
				TenantID: args.TenantID, InstanceID: args.InstanceID, LookbackDays: TimeParseScoreLookbackDays,
				PolicyVersion: policyVersion, QueryVersion: queryVersion,
			})
			if err == nil {
				return nil
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("get existing time parse score: %w", err)
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
		if !instance.StartTime.Valid {
			return river.JobCancel(fmt.Errorf("instance %s has no start time", args.InstanceID))
		}
		cutoff := instance.StartTime.Time.UTC()
		windowStart := cutoff.AddDate(0, 0, -int(TimeParseScoreLookbackDays))
		speedrun, speedrunErr := tx.GetInstanceSpeedrun(ctx, args.InstanceID)
		if speedrunErr != nil && !errors.Is(speedrunErr, pgx.ErrNoRows) {
			return fmt.Errorf("get instance speedrun: %w", speedrunErr)
		}
		bossKills, err := tx.GetInstanceCleanEncounterKillTimes(ctx, args.InstanceID)
		if err != nil {
			return fmt.Errorf("get boss kill times: %w", err)
		}

		type scopedScoreResults struct {
			server timeparsepolicy.ScoreResult
			realm  timeparsepolicy.ScoreResult
			guild  *timeparsepolicy.ScoreResult
		}
		type bossScoreRow struct {
			encounterID   uuid.UUID
			encounterName string
			duration      int64
			results       scopedScoreResults
		}
		setScopeResult := func(results *scopedScoreResults, scope string, result timeparsepolicy.ScoreResult) {
			switch scope {
			case TimeParseScopeServer:
				results.server = result
			case TimeParseScopeRealm:
				results.realm = result
			case TimeParseScopeGuild:
				results.guild = &result
			}
		}

		scopes := []string{TimeParseScopeServer, TimeParseScopeRealm}
		if instance.GuildID.Valid {
			scopes = append(scopes, TimeParseScopeGuild)
		}
		bossRows := make([]bossScoreRow, 0, len(bossKills))
		for _, kill := range bossKills {
			if kill.DurationMs > 0 {
				bossRows = append(bossRows, bossScoreRow{encounterID: kill.EncounterID, encounterName: kill.EncounterName, duration: kill.DurationMs})
			}
		}
		cutoffDB := pgtype.Timestamptz{Time: cutoff, Valid: true}
		windowDB := pgtype.Timestamptz{Time: windowStart, Valid: true}
		guildFilter := uuid.Nil
		if instance.GuildID.Valid {
			guildFilter = instance.GuildID.UUID
		}
		var clearResults *scopedScoreResults
		if speedrunErr == nil && speedrun.Qualified && speedrun.RankedDurationMs.Valid && speedrun.RankedDurationMs.Int64 > 0 {
			clearResults = &scopedScoreResults{}
		}
		for _, scope := range scopes {
			if clearResults != nil {
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
				setScopeResult(clearResults, scope, result)
			}
			for index := range bossRows {
				row := &bossRows[index]
				cohort, cohortErr := tx.GetScopedTimeParseBossKillCohort(ctx, database.GetScopedTimeParseBossKillCohortParams{
					TenantID: args.TenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
					Cutoff: cutoffDB, WindowStart: windowDB, ExcludeRunID: instance.RunID,
					InstanceName: instance.InstanceName, EncounterName: row.encounterName,
					DifficultyName: instance.DifficultyName, MaxPlayers: int16(instance.MaxPlayers),
					Scope: scope, RealmID: instance.RealmID, GuildID: guildFilter,
				})
				if cohortErr != nil {
					return fmt.Errorf("load %s boss cohort %q: %w", scope, row.encounterName, cohortErr)
				}
				result, _ := timeparsepolicy.ScoreTime(cohort, row.duration)
				setScopeResult(&row.results, scope, result)
			}
		}

		if err := tx.DeleteTimeParseScoreForContract(ctx, database.DeleteTimeParseScoreForContractParams{
			TenantID: args.TenantID, InstanceID: args.InstanceID, LookbackDays: TimeParseScoreLookbackDays,
			PolicyVersion: policyVersion, QueryVersion: queryVersion,
		}); err != nil {
			return fmt.Errorf("delete old time parse score: %w", err)
		}
		clearDuration := pgtype.Int8{}
		clearServer, clearRealm, clearGuild := nullableLockedScore(nil), nullableLockedScore(nil), nullableLockedScore(nil)
		if clearResults != nil {
			clearDuration = pgtype.Int8{Int64: speedrun.RankedDurationMs.Int64, Valid: true}
			clearServer = nullableLockedScore(&clearResults.server)
			clearRealm = nullableLockedScore(&clearResults.realm)
			clearGuild = nullableLockedScore(clearResults.guild)
		}
		score, err := tx.InsertTimeParseScore(ctx, database.InsertTimeParseScoreParams{
			TenantID: args.TenantID, InstanceID: args.InstanceID, RunID: instance.RunID,
			LogGroupID: uuid.NullUUID{UUID: instance.LogGroupID, Valid: true}, RealmID: instance.RealmID, GuildID: instance.GuildID,
			ClearDurationMs:         clearDuration,
			ClearServerPreciseScore: clearServer.precise, ClearServerDisplayScore: clearServer.display,
			ClearServerRank: clearServer.rank, ClearServerSampleSize: clearServer.sampleSize, ClearServerStatus: clearServer.status,
			ClearRealmPreciseScore: clearRealm.precise, ClearRealmDisplayScore: clearRealm.display,
			ClearRealmRank: clearRealm.rank, ClearRealmSampleSize: clearRealm.sampleSize, ClearRealmStatus: clearRealm.status,
			ClearGuildPreciseScore: clearGuild.precise, ClearGuildDisplayScore: clearGuild.display,
			ClearGuildRank: clearGuild.rank, ClearGuildSampleSize: clearGuild.sampleSize, ClearGuildStatus: clearGuild.status,
			Cutoff: cutoffDB, WindowStart: windowDB, LookbackDays: TimeParseScoreLookbackDays,
			PolicyVersion: policyVersion, QueryVersion: queryVersion,
		})
		if err != nil {
			return fmt.Errorf("insert time parse score: %w", err)
		}
		for _, row := range bossRows {
			guild := nullableLockedScore(row.results.guild)
			if err := tx.InsertTimeParseBossScore(ctx, database.InsertTimeParseBossScoreParams{
				TimeParseScoreID: score.ID, EncounterID: row.encounterID, EncounterName: row.encounterName, DurationMs: row.duration,
				ServerPreciseScore: row.results.server.PreciseScore, ServerDisplayScore: int16(row.results.server.DisplayScore),
				ServerRank: int32(row.results.server.Rank), ServerSampleSize: int32(row.results.server.SampleSize), ServerStatus: string(row.results.server.Status),
				RealmPreciseScore: row.results.realm.PreciseScore, RealmDisplayScore: int16(row.results.realm.DisplayScore),
				RealmRank: int32(row.results.realm.Rank), RealmSampleSize: int32(row.results.realm.SampleSize), RealmStatus: string(row.results.realm.Status),
				GuildPreciseScore: guild.precise, GuildDisplayScore: guild.display, GuildRank: guild.rank,
				GuildSampleSize: guild.sampleSize, GuildStatus: guild.status,
			}); err != nil {
				return fmt.Errorf("insert time parse boss score: %w", err)
			}
		}
		return nil
	}, nil)
}

type nullableScoreColumns struct {
	precise    pgtype.Float8
	display    pgtype.Int2
	rank       pgtype.Int4
	sampleSize pgtype.Int4
	status     pgtype.Text
}

func nullableLockedScore(result *timeparsepolicy.ScoreResult) nullableScoreColumns {
	if result == nil {
		return nullableScoreColumns{}
	}
	return nullableScoreColumns{
		precise:    pgtype.Float8{Float64: result.PreciseScore, Valid: true},
		display:    pgtype.Int2{Int16: int16(result.DisplayScore), Valid: true},
		rank:       pgtype.Int4{Int32: int32(result.Rank), Valid: true},
		sampleSize: pgtype.Int4{Int32: int32(result.SampleSize), Valid: true},
		status:     pgtype.Text{String: string(result.Status), Valid: true},
	}
}

const KindBackfillTimeParseScores = "backfill-time-parse-scores"

// Manually enqueue from River UI with kind "backfill-time-parse-scores" and
// args {} to dispatch the next 100 missing historical instances across all
// tenants. Optional args: tenant_id, started_after/started_before (RFC3339),
// batch_size (max 500), and force. Each instance uses its own start time as
// the scoring cutoff, with the preceding 60 days as its cohort window.
type ArgsBackfillTimeParseScores struct {
	TenantID      *uuid.UUID `json:"tenant_id,omitempty"`
	StartedAfter  string     `json:"started_after,omitempty"`
	StartedBefore string     `json:"started_before,omitempty"`
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
			InstanceID: candidate.InstanceID, TenantID: tenantID, Force: job.Args.Force,
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
