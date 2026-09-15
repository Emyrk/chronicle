package retention

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindRetention      = "retention"
	KindRetentionRealm = "retention-realm"
	DefaultPageSize    = 5000
)

// ---------------------------------------------------------------------------
// ArgsRetention — dispatch job: fans out one ArgsRetentionRealm per realm.
// ---------------------------------------------------------------------------

type ArgsRetention struct {
	DryRun bool `json:"dry_run"`
}

func (ArgsRetention) Kind() string { return KindRetention }

func (ArgsRetention) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRetention,
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

// Worker is the dispatch worker. It enqueues one realm-batch job per realm
// that has an active retention policy.
type Worker struct {
	river.WorkerDefaults[ArgsRetention]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *Worker) Work(ctx context.Context, job *river.Job[ArgsRetention]) error {
	logger := w.Logger.With(slog.Bool("dry_run", job.Args.DryRun))
	logger.InfoContext(ctx, "dispatching retention jobs")

	realmIDs, err := w.Store.GetRealmsWithRetentionPolicies(ctx)
	if err != nil {
		return fmt.Errorf("get realms with policies: %w", err)
	}

	for _, realmID := range realmIDs {
		_, err := w.Queue.Insert(ctx, ArgsRetentionRealm{
			RealmID:    realmID,
			DryRun:     job.Args.DryRun,
			CursorTime: time.Time{},
			CursorID:   uuid.Nil,
			PageSize:   DefaultPageSize,
		}, nil)
		if err != nil {
			logger.ErrorContext(ctx, "failed to enqueue realm retention job",
				slog.String("realm_id", realmID.String()),
				slog.String("error", err.Error()),
			)
		}
	}

	logger.InfoContext(ctx, "dispatched retention jobs",
		slog.Int("realms", len(realmIDs)),
	)
	return nil
}

// ---------------------------------------------------------------------------
// ArgsRetentionRealm — processes one page of instances for a single realm.
// When the page is full, enqueues the next page with an advanced cursor.
// ---------------------------------------------------------------------------

type ArgsRetentionRealm struct {
	RealmID    uuid.UUID `json:"realm_id"`
	DryRun     bool      `json:"dry_run"`
	CursorTime time.Time `json:"cursor_time"`
	CursorID   uuid.UUID `json:"cursor_id"`
	PageSize   int       `json:"page_size"`
}

func (ArgsRetentionRealm) Kind() string { return KindRetentionRealm }

func (ArgsRetentionRealm) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRetention,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
	}
}

// RealmWorker processes a single page of instances for one realm.
type RealmWorker struct {
	river.WorkerDefaults[ArgsRetentionRealm]

	Store   database.Store
	Storage storage.ObjectStorage
	Queue   *riverqueue.Queues
	Logger  *slog.Logger
}

func (w *RealmWorker) Work(ctx context.Context, job *river.Job[ArgsRetentionRealm]) error {
	args := job.Args
	logger := w.Logger.With(
		slog.String("realm_id", args.RealmID.String()),
		slog.Bool("dry_run", args.DryRun),
	)

	now := time.Now()

	// Load policy + rules.
	policy, err := w.Store.GetRetentionPolicyForRealm(ctx, uuid.NullUUID{UUID: args.RealmID, Valid: true})
	if err != nil {
		return fmt.Errorf("get policy: %w", err)
	}

	rules, err := loadRules(ctx, w.Store, policy.ID)
	if err != nil {
		return err
	}

	// Fetch one page of candidates.
	pageSize := args.PageSize
	if pageSize <= 0 {
		pageSize = DefaultPageSize
	}

	candidates, err := w.Store.GetInstancesForRetentionCheckPaged(ctx, database.GetInstancesForRetentionCheckPagedParams{
		RealmID:    args.RealmID,
		CursorTime: pgtype.Timestamptz{Time: args.CursorTime, Valid: true},
		CursorID:   args.CursorID,
		PageSize:   int32(pageSize),
	})
	if err != nil {
		return fmt.Errorf("get instances: %w", err)
	}

	// Evaluate rules.
	var toDelete []uuid.UUID
	var toDeleteGroups []uuid.UUID
	var kept int64
	for _, c := range candidates {
		candidate := instanceCandidateFromPagedRow(c)
		result := Evaluate(rules, candidate, now)
		if result.Action == ActionDelete {
			toDelete = append(toDelete, c.ID)
			toDeleteGroups = append(toDeleteGroups, c.LogGroupID)
		} else {
			kept++
		}
	}

	logger.InfoContext(ctx, "retention page evaluated",
		slog.Int("candidates", len(candidates)),
		slog.Int("to_delete", len(toDelete)),
		slog.Int("candidates", len(candidates)),
		slog.Int64("kept", kept),
	)

	if !args.DryRun && len(toDelete) > 0 {
		// Delete object storage first (we retry DB deletes).
		for _, groupID := range toDeleteGroups {
			_, _ = w.Storage.RemoveFile(ctx, "raidlogs", []string{groupID.String()})
		}

		identities, err := w.Store.RankingRunIdentitiesByInstanceIDs(ctx, toDelete)
		if err != nil {
			return fmt.Errorf("load ranking run identities: %w", err)
		}
		deleted, err := w.Store.DeleteLogInstancesByIDs(ctx, toDelete)
		if err != nil {
			return fmt.Errorf("delete instances: %w", err)
		}
		affectedIDs := make([]uuid.UUID, 0, len(identities)*2)
		for _, identity := range identities {
			affectedIDs = append(affectedIDs, identity.InstanceID, identity.RunID)
		}
		const rankingRefreshBatchSize = 500
		for start := 0; start < len(affectedIDs); start += rankingRefreshBatchSize {
			end := min(start+rankingRefreshBatchSize, len(affectedIDs))
			if _, err := w.Queue.Insert(ctx, rankingargs.NewRefreshRankingRuns(affectedIDs[start:end]...), nil); err != nil {
				logger.ErrorContext(ctx, "failed to enqueue ranking run refresh after retention deletion", slog.Any("error", err))
			}
		}

		_ = w.Store.UpdateRetentionPolicyStats(ctx, database.UpdateRetentionPolicyStatsParams{
			ID:      policy.ID,
			Deleted: deleted,
			Kept:    kept,
		})
	} else if args.DryRun {
		_ = w.Store.UpdateRetentionPolicyStats(ctx, database.UpdateRetentionPolicyStatsParams{
			ID:      policy.ID,
			Deleted: int64(len(toDelete)),
			Kept:    kept,
		})
	}

	// If we got a full page, enqueue the next page.
	if len(candidates) == pageSize {
		last := candidates[len(candidates)-1]
		_, err := w.Queue.Insert(ctx, ArgsRetentionRealm{
			RealmID:    args.RealmID,
			DryRun:     args.DryRun,
			CursorTime: last.EndTime.Time,
			CursorID:   last.ID,
			PageSize:   pageSize,
		}, nil)
		if err != nil {
			return fmt.Errorf("enqueue next page: %w", err)
		}
	}

	return nil
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

func loadRules(ctx context.Context, store database.StoreQueries, policyID uuid.UUID) ([]Rule, error) {
	dbRules, err := store.GetRetentionRulesByPolicy(ctx, policyID)
	if err != nil {
		return nil, fmt.Errorf("get rules: %w", err)
	}

	rules := make([]Rule, len(dbRules))
	for i, r := range dbRules {
		conditions, err := ParseConditions(r.Conditions)
		if err != nil {
			return nil, fmt.Errorf("parse conditions for rule %d: %w", r.Priority, err)
		}
		rules[i] = Rule{
			Priority:    int(r.Priority),
			Action:      r.Action,
			Conditions:  conditions,
			Description: r.Description,
		}
	}
	return rules, nil
}

func instanceCandidateFromRow(c database.GetInstancesForRetentionCheckRow) InstanceCandidate {
	candidate := InstanceCandidate{
		ID:           c.ID,
		InstanceName: c.InstanceName,
		EndTime:      c.EndTime.Time,
		LogGroupID:   c.LogGroupID,
	}
	if c.GuildRank.Valid {
		candidate.GuildRank = &c.GuildRank.Int64
	}
	return candidate
}

func instanceCandidateFromPagedRow(c database.GetInstancesForRetentionCheckPagedRow) InstanceCandidate {
	candidate := InstanceCandidate{
		ID:           c.ID,
		InstanceName: c.InstanceName,
		EndTime:      c.EndTime.Time,
		LogGroupID:   c.LogGroupID,
	}
	if c.GuildRank.Valid {
		candidate.GuildRank = &c.GuildRank.Int64
	}
	return candidate
}

// Preview runs the retention evaluation for a specific realm without deleting anything.
// It loads all instances (unbounded) — admin-only, synchronous.
func Preview(ctx context.Context, store database.StoreQueries, realmID uuid.UUID, now time.Time) ([]PreviewItem, error) {
	policy, err := store.GetRetentionPolicyForRealm(ctx, uuid.NullUUID{UUID: realmID, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("get policy: %w", err)
	}

	rules, err := loadRules(ctx, store, policy.ID)
	if err != nil {
		return nil, err
	}

	candidates, err := store.GetInstancesForRetentionCheck(ctx, realmID)
	if err != nil {
		return nil, fmt.Errorf("get instances: %w", err)
	}

	items := make([]PreviewItem, 0, len(candidates))
	for _, c := range candidates {
		candidate := instanceCandidateFromRow(c)
		result := Evaluate(rules, candidate, now)
		items = append(items, PreviewItem{
			InstanceID:   c.ID,
			InstanceName: c.InstanceName,
			EndTime:      c.EndTime.Time,
			Action:       result.Action,
			MatchedRule:  result.MatchedRule,
		})
	}
	return items, nil
}

// PreviewItem is a single instance's evaluation result.
type PreviewItem struct {
	InstanceID   uuid.UUID
	InstanceName string
	EndTime      time.Time
	Action       string // "keep", "delete", or "" (no match = default keep)
	MatchedRule  *string
}
