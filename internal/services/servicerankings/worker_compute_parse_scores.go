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
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// RetryDelays defines the bounded retry schedule for missing-snapshot retries.
// Attempt 0 = immediate, then +24h, +48h (72h total), +7d (10d total).
var RetryDelays = []time.Duration{
	0,                  // attempt 0: immediate
	24 * time.Hour,     // attempt 1: +24h
	48 * time.Hour,     // attempt 2: +48h (72h total)
	7 * 24 * time.Hour, // attempt 3: +7d (10d total)
}

// MaxParseScoreAttempts is the number of scheduled attempts before we stop.
const MaxParseScoreAttempts = 4

// QueryVersion is bumped when the SQL query semantics change (e.g. cohort
// selection, snapshot membership filters). This is separate from PolicyVersion
// which tracks scoring algorithm changes.
const QueryVersion = 1

// WorkerComputeParseScores computes and persists parse scores for a single instance.
type WorkerComputeParseScores struct {
	river.WorkerDefaults[parseargs.ArgsComputeParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerComputeParseScores) Work(ctx context.Context, job *river.Job[parseargs.ArgsComputeParseScores]) error {
	ctx = servicetenant.AdminBypass(ctx)

	instanceID := job.Args.InstanceID
	tenantID := job.Args.TenantID
	attempt := job.Args.Attempt

	logger := w.Logger.With(
		slog.String("instance_id", instanceID.String()),
		slog.String("tenant_id", tenantID.String()),
		slog.Int("attempt", attempt),
	)

	// Fetch instance metadata.
	inst, err := w.Store.GetLogInstanceForScoring(ctx, instanceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			logger.Warn("instance not found, cancelling job")
			return river.JobCancel(fmt.Errorf("instance %s not found", instanceID))
		}
		return fmt.Errorf("get instance: %w", err)
	}

	// Resolve the canonical historical snapshot: latest published cutoff
	// <= instance start for this tenant, default lookback, AND matching
	// current policy/query version. Version filtering is done in SQL so
	// an incompatible newer snapshot cannot hide a compatible older one.
	var snapshot database.RankingSnapshot
	if inst.StartTime.Valid {
		snapshot, err = w.Store.GetScoringSnapshotBefore(ctx, database.GetScoringSnapshotBeforeParams{
			TenantID:      tenantID,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			Before:        inst.StartTime,
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
		})
	} else {
		snapshot, err = w.Store.GetScoringSnapshotLatest(ctx, database.GetScoringSnapshotLatestParams{
			TenantID:      tenantID,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
		})
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return w.handleNoSnapshot(ctx, logger, instanceID, tenantID, attempt)
		}
		return fmt.Errorf("resolve snapshot: %w", err)
	}

	// Load the instance's ranking rows from encounter_dps_rankings.
	rankings, err := w.Store.ListRankingsForInstance(ctx, instanceID)
	if err != nil {
		return fmt.Errorf("list rankings: %w", err)
	}

	sourceCount := len(rankings)

	if sourceCount == 0 {
		logger.Debug("no rankings for instance, writing empty receipt")
		// Atomic: empty receipt in a transaction.
		return w.Store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
				TenantID:      tenantID,
				InstanceID:    instanceID,
				SnapshotID:    snapshot.ID,
				PolicyVersion: int16(parsepolicy.PolicyVersion),
				QueryVersion:  int16(QueryVersion),
				LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
				SourceCount:   0,
				ResultCount:   0,
			}); err != nil {
				return fmt.Errorf("insert empty receipt: %w", err)
			}
			return nil
		}, nil)
	}

	snapshotCohortMode := parsepolicy.CohortMode(snapshot.CohortMode)

	// Compute and persist scores per encounter, per player, for BOTH DPS and HPS.
	// Separate cohort cache keys per metric.
	dpsCohortCache := make(map[string][]float64)
	hpsCohortCache := make(map[string][]float64)
	var scored int

	// Build identity fields for results.
	logGroupID := uuid.NullUUID{UUID: inst.LogGroupID, Valid: inst.LogGroupID != uuid.Nil}
	guildID := inst.GuildID

	// Atomic transaction: delete old results + insert new results + receipt.
	// Delete is scoped to (tenant_id, instance_id) so one tenant cannot
	// erase another's projections.
	txErr := w.Store.InTx(ctx, func(tx database.Store) error {
		// Delete previous results for this tenant+instance inside the
		// transaction so replacement is atomic.
		if dErr := tx.DeleteParseScoreResultsForTenantInstance(ctx, database.DeleteParseScoreResultsForTenantInstanceParams{
			TenantID:   tenantID,
			InstanceID: instanceID,
		}); dErr != nil {
			return fmt.Errorf("delete old results: %w", dErr)
		}

		for _, r := range rankings {
			// Score both DPS and HPS for each ranking row.
			type metricEntry struct {
				metric string
				value  float64
				cache  map[string][]float64
			}
			metrics := []metricEntry{
				{"dps", r.Dps, dpsCohortCache},
				{"hps", r.Hps, hpsCohortCache},
			}

			for _, m := range metrics {
				if m.value <= 0 {
					continue
				}

				// Build cohort key (separate per metric).
				var playerSpec pgtype.Text
				if snapshotCohortMode == parsepolicy.CohortModeSpec {
					playerSpec = pgtype.Text{String: r.PlayerSpec, Valid: true}
				}

				bucketKey := fmt.Sprintf("%s|%s|%d|%s|%s",
					r.EncounterName, r.DifficultyName, r.MaxPlayers,
					r.PlayerClass, playerSpec.String)

				cohort, cached := m.cache[bucketKey]
				if !cached {
					cohortRows, cErr := w.Store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
						Metric:         m.metric,
						SnapshotID:     snapshot.ID,
						EncounterName:  r.EncounterName,
						DifficultyName: r.DifficultyName,
						MaxPlayers:     r.MaxPlayers,
						PlayerClass:    r.PlayerClass,
						PlayerSpec:     playerSpec,
					})
					if cErr != nil {
						logger.Error("failed to load cohort",
							"encounter", r.EncounterName,
							"metric", m.metric,
							"error", cErr,
						)
						continue
					}
					cohort = make([]float64, 0, len(cohortRows))
					for _, cr := range cohortRows {
						if v, ok := toFloat64(cr.MetricValue); ok && v > 0 {
							cohort = append(cohort, v)
						}
					}
					m.cache[bucketKey] = cohort
				}

				scoreResult, ok := parsepolicy.Score(cohort, m.value)
				status := string(scoreResult.Status)
				if !ok {
					// Persist sample_too_small for complete accounting.
					if scoreResult.Status == parsepolicy.StatusSampleTooSmall {
						if iErr := tx.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
							TenantID:       tenantID,
							InstanceID:     instanceID,
							RunID:          inst.RunID,
							SnapshotID:     snapshot.ID,
							LogGroupID:     logGroupID,
							GuildID:        guildID,
							EncounterName:  r.EncounterName,
							PlayerGuid:     r.PlayerGuid,
							PlayerName:     r.PlayerName,
							PlayerClass:    r.PlayerClass,
							PlayerSpec:     r.PlayerSpec,
							PlayerRole:     r.PlayerRole,
							Metric:         m.metric,
							MetricValue:    m.value,
							PreciseScore:   0,
							DisplayScore:   0,
							Rank:           0,
							SampleSize:     int32(scoreResult.SampleSize),
							Status:         status,
							InstanceName:   inst.InstanceName,
							DifficultyName: inst.DifficultyName,
							MaxPlayers:     int16(inst.MaxPlayers),
							KilledAt:       r.KilledAt,
						}); iErr != nil {
							return fmt.Errorf("insert sample_too_small result: %w", iErr)
						}
						scored++
					}
					continue
				}

				if iErr := tx.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
					TenantID:       tenantID,
					InstanceID:     instanceID,
					RunID:          inst.RunID,
					SnapshotID:     snapshot.ID,
					LogGroupID:     logGroupID,
					GuildID:        guildID,
					EncounterName:  r.EncounterName,
					PlayerGuid:     r.PlayerGuid,
					PlayerName:     r.PlayerName,
					PlayerClass:    r.PlayerClass,
					PlayerSpec:     r.PlayerSpec,
					PlayerRole:     r.PlayerRole,
					Metric:         m.metric,
					MetricValue:    m.value,
					PreciseScore:   scoreResult.PreciseScore,
					DisplayScore:   int16(scoreResult.DisplayScore),
					Rank:           int32(scoreResult.Rank),
					SampleSize:     int32(scoreResult.SampleSize),
					Status:         status,
					InstanceName:   inst.InstanceName,
					DifficultyName: inst.DifficultyName,
					MaxPlayers:     int16(inst.MaxPlayers),
					KilledAt:       r.KilledAt,
				}); iErr != nil {
					return fmt.Errorf("insert score result: %w", iErr)
				}
				scored++
			}
		}

		// Receipt inside the same transaction: atomic with results.
		if _, rErr := tx.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
			TenantID:      tenantID,
			InstanceID:    instanceID,
			SnapshotID:    snapshot.ID,
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
			LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
			SourceCount:   int32(sourceCount),
			ResultCount:   int32(scored),
		}); rErr != nil {
			return fmt.Errorf("insert receipt: %w", rErr)
		}

		return nil
	}, nil)

	if txErr != nil {
		return fmt.Errorf("scoring transaction: %w", txErr)
	}

	logger.Info("computed parse scores",
		slog.Int("source_count", sourceCount),
		slog.Int("result_count", scored),
		slog.String("snapshot_id", snapshot.ID.String()),
	)

	return nil
}

// handleNoSnapshot handles the case when no published snapshot exists yet.
// It schedules a retry job if within the bounded retry limit.
// No receipt is created — only successful completions produce receipts.
func (w *WorkerComputeParseScores) handleNoSnapshot(
	ctx context.Context,
	logger *slog.Logger,
	instanceID, tenantID uuid.UUID,
	attempt int,
) error {
	nextAttempt := attempt + 1
	if nextAttempt >= MaxParseScoreAttempts {
		logger.Warn("exhausted retry attempts for missing snapshot, stopping retry chain",
			slog.Int("total_attempts", nextAttempt),
		)
		// No receipt created. Daily repair will re-enqueue only when
		// an eligible snapshot becomes available.
		return nil
	}

	delay := RetryDelays[nextAttempt]
	nextTime := time.Now().Add(delay)

	// Enqueue a follow-up job scheduled at the delay time.
	if w.Queue == nil {
		logger.Warn("no queue available, cannot schedule retry")
		return nil
	}
	_, err := w.Queue.Insert(ctx, parseargs.ArgsComputeParseScores{
		InstanceID: instanceID,
		TenantID:   tenantID,
		Attempt:    nextAttempt,
	}, &river.InsertOpts{
		ScheduledAt: nextTime,
	})
	if err != nil {
		logger.Error("failed to enqueue retry job",
			"error", err,
			"next_attempt", nextAttempt,
		)
		// Don't fail the job — daily repair will catch it.
		return nil
	}

	logger.Info("no snapshot available, scheduled retry",
		slog.Int("next_attempt", nextAttempt),
		slog.Time("scheduled_at", nextTime),
	)

	return nil
}

// ---------------------------------------------------------------------------
// ArgsRepairParseScores — daily bounded repair dispatcher.
// Finds ALL eligible instances missing a matching successful receipt,
// including instances with no receipt at all, old instances, snapshot
// deletion/rebuild, and policy/query changes.
// ---------------------------------------------------------------------------

const KindRepairParseScores = "repair-parse-scores"

type ArgsRepairParseScores struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRepairParseScores) Kind() string { return KindRepairParseScores }

func (ArgsRepairParseScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

// WorkerRepairParseScores finds instances missing receipts and re-enqueues jobs.
type WorkerRepairParseScores struct {
	river.WorkerDefaults[ArgsRepairParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerRepairParseScores) Work(ctx context.Context, job *river.Job[ArgsRepairParseScores]) error {
	ctx = servicetenant.AdminBypass(ctx)
	tenantID := job.Args.TenantID

	if w.Queue == nil {
		w.Logger.Warn("no queue available for repair dispatcher")
		return nil
	}

	// Per-instance canonical repair: resolve each instance's historical
	// snapshot via LATERAL join in SQL. Instances without an eligible
	// snapshot are excluded (not re-enqueued), preserving bounded retry stop.
	missing, err := w.Store.ListInstancesMissingParseReceiptWithSnapshot(ctx, database.ListInstancesMissingParseReceiptWithSnapshotParams{
		TenantID:      tenantID,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(QueryVersion),
		MaxRows:       100,
	})
	if err != nil {
		return fmt.Errorf("list missing receipts: %w", err)
	}

	if len(missing) == 0 {
		w.Logger.Debug("no instances need parse score repair")
		return nil
	}

	var enqueued int
	for _, m := range missing {
		_, iErr := w.Queue.Insert(ctx, parseargs.ArgsComputeParseScores{
			InstanceID: m.InstanceID,
			TenantID:   tenantID,
			Attempt:    0, // Fresh attempt — repair found an eligible snapshot.
		}, nil)
		if iErr != nil {
			w.Logger.Error("failed to enqueue repair job",
				"instance_id", m.InstanceID.String(),
				"error", iErr,
			)
			continue
		}
		enqueued++
	}

	w.Logger.Info("repair dispatcher completed",
		slog.Int("missing", len(missing)),
		slog.Int("enqueued", enqueued),
	)

	return nil
}
