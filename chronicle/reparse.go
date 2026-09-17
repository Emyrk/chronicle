package chronicle

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindLogReparse = "log-reparse"

type ArgsLogReparse struct {
	LogID        uuid.UUID `json:"log_group_id"`
	RealmID      uuid.UUID `json:"realm_id,omitempty"`
	TenantID     uuid.UUID `json:"tenant_id,omitempty"`
	Verbose      bool      `json:"verbose,omitempty"`
	IdentityMode bool      `json:"identity_mode,omitempty"`
}

type logReparseMetadata struct {
	PreviousRankingRunIDs []uuid.UUID `json:"previous_ranking_run_ids,omitempty"`
}

func (ArgsLogReparse) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverqueue.QueueLogParsing,
		Priority:    riverqueue.PriorityDefault,
		MaxAttempts: 5,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
			},
		},
	}
}

func (a ArgsLogReparse) Kind() string { return KindLogReparse }

type WorkerLogReparse struct {
	parent *Chronicle

	river.WorkerDefaults[ArgsLogReparse]
}

func (c *Chronicle) NewWorkerReLogParse() river.Worker[ArgsLogReparse] {
	return &WorkerLogReparse{
		parent: c,
	}
}

func (w *WorkerLogReparse) Work(ctx context.Context, job *river.Job[ArgsLogReparse]) error {
	// Clear the parsed data for the log group and re-initiate parsing
	db := w.parent.Zed

	logGroup, err := db.GetWoWLogGroupByID(ctx, job.Args.LogID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return river.JobCancel(fmt.Errorf("log group %s not found", job.Args.LogID))
		}
		return fmt.Errorf("fetch log group: %w", err)
	}

	var metadata logReparseMetadata
	if len(job.Metadata) > 0 {
		if err := json.Unmarshal(job.Metadata, &metadata); err != nil {
			return fmt.Errorf("decode reparse metadata: %w", err)
		}
	}
	previousRankingRunIDs := metadata.PreviousRankingRunIDs
	if len(previousRankingRunIDs) == 0 {
		identities, err := db.RankingRunIdentitiesByLogGroupID(ctx, job.Args.LogID)
		if err != nil {
			return fmt.Errorf("load ranking run identities: %w", err)
		}
		previousRankingRunIDs = rankingRunLogGroupIdentitySeeds(identities)
	}

	list, err := w.parent.ListLogGroupJobs(ctx, job.Args.LogID)
	if err != nil {
		return fmt.Errorf("list existing log group jobs: %w", err)
	}

	for _, existingJob := range list.Jobs {
		if existingJob.ID == job.ID {
			continue
		}

		if job.State == rivertype.JobStateAvailable ||
			job.State == rivertype.JobStatePending ||
			job.State == rivertype.JobStateRunning ||
			job.State == rivertype.JobStateScheduled ||
			job.State == rivertype.JobStateRetryable {
			// Cancel existing jobs that are not the current one
			_, err = w.parent.queue.JobCancel(ctx, existingJob.ID)
			if err != nil {
				return fmt.Errorf("cancel existing job %d: %w", existingJob.ID, err)
			}
		}
	}

	parseCtx := ctx
	if job.Args.TenantID != uuid.Nil {
		parseCtx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	parseArgs := newReplacementArgsLogParse(parseCtx, job.Args.LogID, job.Args.Verbose, job.Args.IdentityMode, job.Args.RealmID, previousRankingRunIDs)
	insertOpts := parseArgs.InsertOpts()
	insertOpts.Pending = true
	insertOpts.Tags = []string{fmt.Sprintf("owner_%s", logGroup.WoWLogGroup.Owner.String())}
	res, err := w.parent.queue.Insert(parseCtx, parseArgs, &insertOpts)
	if err != nil {
		return fmt.Errorf("stage replacement log parse job: %w", err)
	}

	if err := db.DeleteAllParsedLogsByGroupID(ctx, job.Args.LogID); err != nil {
		_, _ = w.parent.queue.JobDelete(ctx, res.Job.ID)
		return fmt.Errorf("delete parsed logs for group: %w", err)
	}
	if _, err := w.parent.queue.JobRetry(parseCtx, res.Job.ID); err != nil {
		return fmt.Errorf("release replacement log parse job %d: %w", res.Job.ID, err)
	}

	_ = river.RecordOutput(ctx, map[string]any{
		"reparse_job_id": res.Job.ID,
	})
	return nil
}

func (c *Chronicle) EnqueueReParseLog(ctx context.Context, logID uuid.UUID, verbose bool, identityMode bool, realmID uuid.UUID) (*rivertype.JobInsertResult, error) {
	identities, err := c.Zed.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return nil, fmt.Errorf("load ranking run identities: %w", err)
	}

	metadata, err := json.Marshal(logReparseMetadata{
		PreviousRankingRunIDs: rankingargs.NormalizeIDs(rankingRunLogGroupIdentitySeeds(identities)),
	})
	if err != nil {
		return nil, fmt.Errorf("encode reparse metadata: %w", err)
	}

	t := servicetenant.TenantIDFromContext(ctx)
	res, err := c.queue.Insert(ctx, ArgsLogReparse{
		LogID:        logID,
		RealmID:      realmID,
		TenantID:     t,
		Verbose:      verbose,
		IdentityMode: identityMode,
	}, &river.InsertOpts{
		Tags:     []string{},
		Metadata: metadata,
	})

	return res, err
}

func (c *Chronicle) ListLogGroupJobs(ctx context.Context, groupID uuid.UUID) (*river.JobListResult, error) {
	opts := river.NewJobListParams().Where(`args->>'log_group_id' = @group_id`, map[string]any{
		"group_id": groupID.String(),
	}).
		Queues(riverqueue.QueueLogParsing).
		Kinds(KindLogParse, KindLogReparse).
		OrderBy(river.JobListOrderByScheduledAt, river.SortOrderDesc)

	list, err := c.queue.JobList(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("fetch log parse jobs: %w", err)
	}
	return list, nil
}
