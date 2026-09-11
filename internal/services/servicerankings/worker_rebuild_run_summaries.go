package servicerankings

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/riverqueue/river"
)

// rankingPlayerRunSummaryVersion is independent from the legacy
// rankings_instance_summaries query version.
const rankingPlayerRunSummaryVersion int16 = 1

const rankingRunSummaryBatchSize = 25

// RankingPlayerRunSummaryVersion returns the current player-run projection version.
func RankingPlayerRunSummaryVersion() int16 { return rankingPlayerRunSummaryVersion }

// WorkerRebuildRankingRunSummaries drains bounded batches from the durable dirty
// queue. It never locks a dirty row while aggregating source rankings.
type WorkerRebuildRankingRunSummaries struct {
	river.WorkerDefaults[rankingargs.ArgsRebuildRankingRunSummaries]

	Store   database.Store
	Logger  *slog.Logger
	metrics *rankingRunSummaryMetrics
}

func (w *WorkerRebuildRankingRunSummaries) Work(ctx context.Context, _ *river.Job[rankingargs.ArgsRebuildRankingRunSummaries]) (workErr error) {
	ctx = servicetenant.AdminBypass(ctx)
	startedAt := time.Now()
	processed := 0
	rebuilt := 0
	deleted := 0
	retainedDirty := 0
	defer func() {
		if w.metrics == nil {
			return
		}
		w.metrics.rebuildDuration.Observe(time.Since(startedAt).Seconds())
		if workErr != nil {
			w.metrics.failures.Inc()
		}
		w.metrics.runsProcessed.Add(float64(processed))
		w.metrics.runsRebuilt.Add(float64(rebuilt))
		w.metrics.runsDeleted.Add(float64(deleted))
		w.metrics.runsRetained.Add(float64(retainedDirty))
		w.observeDirtyQueueMetrics(ctx)
	}()
	w.observeDirtyQueueMetrics(ctx)

	for {
		dirty, err := w.Store.ListDirtyRankingRuns(ctx, rankingRunSummaryBatchSize)
		if err != nil {
			return fmt.Errorf("list dirty ranking runs: %w", err)
		}
		if len(dirty) == 0 {
			break
		}

		for _, item := range dirty {
			outcome, err := rebuildRankingRunSummary(ctx, w.Store, item)
			if err != nil {
				return fmt.Errorf("rebuild ranking run %s generation %d: %w", item.RunID, item.Generation, err)
			}
			processed++
			switch outcome {
			case rebuildOutcomeRebuilt:
				rebuilt++
			case rebuildOutcomeDeleted:
				deleted++
			case rebuildOutcomeRetainedDirty:
				retainedDirty++
			}
		}

		// A conditional-clear miss leaves the row dirty. Stop this invocation so a
		// hot run cannot make the drain spin; River retry/wake-up or the periodic
		// safety net will process the newer generation.
		if retainedDirty > 0 || len(dirty) < rankingRunSummaryBatchSize {
			break
		}
	}

	w.Logger.Info("drained ranking run summary dirty queue",
		slog.Int("processed", processed),
		slog.Int("rebuilt", rebuilt),
		slog.Int("deleted", deleted),
		slog.Int("retained_dirty", retainedDirty),
	)
	_ = river.RecordOutput(ctx, map[string]any{
		"processed":       processed,
		"rebuilt":         rebuilt,
		"deleted":         deleted,
		"retained_dirty":  retainedDirty,
		"summary_version": rankingPlayerRunSummaryVersion,
	})
	return nil
}

func (w *WorkerRebuildRankingRunSummaries) observeDirtyQueueMetrics(ctx context.Context) {
	if w.metrics == nil {
		return
	}
	status, err := w.Store.RankingRunSummaryDirtyStatus(ctx)
	if err != nil {
		w.Logger.Warn("observe ranking run summary dirty queue metrics", slog.String("error", err.Error()))
		return
	}
	w.metrics.queueDepth.Set(float64(status.QueueDepth))
	oldestAge := 0.0
	if status.OldestUpdatedAt.Valid {
		oldestAge = status.ObservedAt.Time.Sub(status.OldestUpdatedAt.Time).Seconds()
		if oldestAge < 0 {
			oldestAge = 0
		}
	}
	w.metrics.oldestDirtyAge.Set(oldestAge)
}

type rebuildOutcome int

const (
	rebuildOutcomeRebuilt rebuildOutcome = iota
	rebuildOutcomeDeleted
	rebuildOutcomeRetainedDirty
)

func rebuildRankingRunSummary(ctx context.Context, store database.Store, dirty database.ListDirtyRankingRunsRow) (rebuildOutcome, error) {
	// Source aggregation is intentionally outside the replacement transaction and
	// holds no lock on ranking_run_summary_dirty. Generation-conditional clearing
	// detects any mutation that races this snapshot.
	source, err := store.RankingRunSummarySource(ctx, dirty.RunID)
	if err != nil {
		return 0, err
	}

	outcome := rebuildOutcomeRebuilt
	if len(source) == 0 {
		outcome = rebuildOutcomeDeleted
	}

	cleared := int64(0)
	err = store.InTx(ctx, func(tx database.Store) error {
		if err := tx.DeleteRankingRunSummary(ctx, dirty.RunID); err != nil {
			return fmt.Errorf("delete previous summary: %w", err)
		}

		if len(source) > 0 {
			run := source[0]
			if err := tx.InsertRankingRunSummary(ctx, database.InsertRankingRunSummaryParams{
				RunID:                    dirty.RunID,
				RepresentativeInstanceID: run.RepresentativeInstanceID,
				TenantID:                 run.TenantID,
				InstanceName:             run.RunInstanceName,
				RealmID:                  run.RunRealmID,
				RealmName:                run.RunRealmName,
				DifficultyName:           run.RunDifficultyName,
				MaxPlayers:               run.RunMaxPlayers,
				BossCoverage:             run.BossCoverage,
				EncounterNames:           run.EncounterNames,
				SummaryVersion:           rankingPlayerRunSummaryVersion,
				SourceGeneration:         dirty.Generation,
			}); err != nil {
				return fmt.Errorf("insert run summary: %w", err)
			}

			for _, player := range source {
				if err := tx.InsertRankingPlayerRunSummary(ctx, database.InsertRankingPlayerRunSummaryParams{
					RunID:          dirty.RunID,
					TenantID:       player.TenantID,
					PlayerGuid:     player.PlayerGuid,
					PlayerName:     player.PlayerName,
					PlayerClass:    player.PlayerClass,
					PlayerSpec:     player.PlayerSpec,
					PlayerSubSpec:  player.PlayerSubSpec,
					PlayerRole:     player.PlayerRole,
					PlayerLevel:    player.PlayerLevel,
					InstanceName:   player.InstanceName,
					EncounterName:  player.EncounterName,
					DifficultyName: player.DifficultyName,
					MaxPlayers:     player.MaxPlayers,
					RealmID:        player.RealmID,
					RealmName:      player.RealmName,
					GuildName:      player.GuildName,
					DamageDone:     player.DamageDone,
					HealingDone:    player.HealingDone,
					AbsorbedDone:   player.AbsorbedDone,
					DurationSecs:   player.DurationSecs,
					Dps:            player.Dps,
					Hps:            player.Hps,
					AvgIlvl:        player.AvgIlvl,
					LogHashedSlug:  player.LogHashedSlug,
					KilledAt:       player.KilledAt,
					TalentSubSpec:  player.TalentSubSpec,
					TalentLayout:   player.TalentLayout,
					SummaryVersion: rankingPlayerRunSummaryVersion,
				}); err != nil {
					return fmt.Errorf("insert player %s summary: %w", player.PlayerGuid, err)
				}
			}
		}

		var err error
		cleared, err = tx.ClearDirtyRankingRunGeneration(ctx, database.ClearDirtyRankingRunGenerationParams(dirty))
		if err != nil {
			return fmt.Errorf("clear dirty generation: %w", err)
		}
		return nil
	}, nil)
	if err != nil {
		return 0, err
	}
	if cleared == 0 {
		return rebuildOutcomeRetainedDirty, nil
	}
	return outcome, nil
}
