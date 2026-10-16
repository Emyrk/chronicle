package chronicle

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindLogReparse = "log-reparse"

type ArgsLogReparse struct {
	LogID        uuid.UUID `json:"log_group_id"`
	Generation   int64     `json:"parse_generation"`
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
	// Dispatch the replacement parse only while this reparse generation is current.
	db := w.parent.Zed

	logGroup, err := db.GetWoWLogGroupByID(ctx, job.Args.LogID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return river.JobCancel(fmt.Errorf("log group %s not found", job.Args.LogID))
		}
		return fmt.Errorf("fetch log group: %w", err)
	}

	if logGroup.WoWLogGroup.ParseGeneration != job.Args.Generation {
		return nil
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

	parseCtx := ctx
	if job.Args.TenantID != uuid.Nil {
		parseCtx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	parseArgs := newReplacementArgsLogParse(parseCtx, job.Args.LogID, job.Args.Generation, job.Args.Verbose, job.Args.IdentityMode, job.Args.RealmID, previousRankingRunIDs)
	insertOpts := parseArgs.InsertOpts()
	insertOpts.Tags = []string{fmt.Sprintf("owner_%s", logGroup.WoWLogGroup.Owner.String())}
	var res *rivertype.JobInsertResult
	err = db.InTx(ctx, func(tx *authz.AuthzTX) error {
		if err := lockParseGeneration(ctx, tx, job.Args.LogID, job.Args.Generation); err != nil {
			return err
		}
		pgxTx, ok := tx.PGXTx()
		if !ok {
			return errors.New("reparse transaction does not expose pgx transaction")
		}
		var insertErr error
		res, insertErr = w.parent.queue.InsertTx(parseCtx, pgxTx, parseArgs, &insertOpts)
		return insertErr
	}, nil)
	if errors.Is(err, errStaleParseGeneration) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("insert replacement log parse job: %w", err)
	}

	_ = river.RecordOutput(ctx, map[string]any{
		"reparse_job_id": res.Job.ID,
	})
	return nil
}

type reparseMetadataStore interface {
	RankingRunIdentitiesByLogGroupID(context.Context, uuid.UUID) ([]database.RankingRunIdentitiesByLogGroupIDRow, error)
	AdvanceWoWLogGroupParseGeneration(context.Context, uuid.UUID) (int64, error)
	DeleteAllParsedLogsByGroupID(context.Context, uuid.UUID) error
}

func (c *Chronicle) EnqueueReParseLog(ctx context.Context, logID uuid.UUID, verbose bool, identityMode bool, realmID uuid.UUID) (*rivertype.JobInsertResult, error) {
	var res *rivertype.JobInsertResult
	err := c.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		pgxTx, ok := tx.PGXTx()
		if !ok {
			return errors.New("reparse enqueue transaction does not expose pgx transaction")
		}
		var enqueueErr error
		res, enqueueErr = c.enqueueReParseLog(ctx, tx, pgxTx, logID, verbose, identityMode, realmID)
		return enqueueErr
	}, nil)
	return res, err
}

func (c *Chronicle) enqueueReParseLog(ctx context.Context, db reparseMetadataStore, tx pgx.Tx, logID uuid.UUID, verbose bool, identityMode bool, realmID uuid.UUID) (*rivertype.JobInsertResult, error) {
	identities, err := db.RankingRunIdentitiesByLogGroupID(ctx, logID)
	if err != nil {
		return nil, fmt.Errorf("load ranking run identities: %w", err)
	}

	generation, err := db.AdvanceWoWLogGroupParseGeneration(ctx, logID)
	if err != nil {
		return nil, fmt.Errorf("advance parse generation: %w", err)
	}
	if err := db.DeleteAllParsedLogsByGroupID(ctx, logID); err != nil {
		return nil, fmt.Errorf("delete parsed logs for prior generation: %w", err)
	}

	metadata, err := json.Marshal(logReparseMetadata{
		PreviousRankingRunIDs: rankingargs.NormalizeIDs(rankingRunLogGroupIdentitySeeds(identities)),
	})
	if err != nil {
		return nil, fmt.Errorf("encode reparse metadata: %w", err)
	}

	t := servicetenant.TenantIDFromContext(ctx)
	args := ArgsLogReparse{
		LogID:        logID,
		Generation:   generation,
		RealmID:      realmID,
		TenantID:     t,
		Verbose:      verbose,
		IdentityMode: identityMode,
	}
	opts := &river.InsertOpts{Tags: []string{}, Metadata: metadata}
	if tx != nil {
		return c.queue.InsertTx(ctx, tx, args, opts)
	}
	return c.queue.Insert(ctx, args, opts)
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
