package chronicle

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindResync = "resync"

// ArgsResync is the River job args for a resync (reparse) operation.
// Jobs are enqueued on the dedicated "resync" queue so the main server
// never consumes them.
type ArgsResync struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
}

func (ArgsResync) Kind() string { return KindResync }

func (ArgsResync) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueResync,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 1,
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

// WorkerResync processes a resync job: deletes previously parsed data for the
// log group, then re-parses it by delegating to WorkerLogParse.Work.
type WorkerResync struct {
	parent *Chronicle
	river.WorkerDefaults[ArgsResync]
}

func (c *Chronicle) NewWorkerResync() *WorkerResync {
	return &WorkerResync{parent: c}
}

func validateResyncRawFiles(
	ctx context.Context,
	files []database.LogFile,
	expectedFiles int,
	load func(context.Context, database.LogFile) ([]byte, error),
) error {
	if len(files) != expectedFiles {
		return fmt.Errorf("validate raw log files: expected %d files, found %d", expectedFiles, len(files))
	}
	for _, file := range files {
		if _, err := load(ctx, file); err != nil {
			return fmt.Errorf("validate raw log file %s: %w", file.ID, err)
		}
	}
	return nil
}

func resyncTenantID(tenantIDs []uuid.NullUUID) (uuid.UUID, error) {
	if len(tenantIDs) == 0 {
		return uuid.Nil, fmt.Errorf("resync log group has no tenant scopes")
	}
	resolved := tenantIDs[0]
	for _, tenantID := range tenantIDs[1:] {
		if resolved.Valid != tenantID.Valid ||
			(resolved.Valid && resolved.UUID != tenantID.UUID) {
			return uuid.Nil, fmt.Errorf("resync log group spans multiple tenant scopes")
		}
	}
	if resolved.Valid {
		return resolved.UUID, nil
	}
	return uuid.Nil, nil
}

func (w *WorkerResync) resolveTenantID(ctx context.Context, logGroupID uuid.UUID) (uuid.UUID, error) {
	instances, err := w.parent.Zed.GetInstancesByLogGroupID(ctx, logGroupID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("fetch existing instances for tenant scope: %w", err)
	}
	if len(instances) == 0 {
		return uuid.Nil, fmt.Errorf("resync log group has no existing instances")
	}

	tenantIDs := make([]uuid.NullUUID, 0, len(instances))
	seenRealms := make(map[uuid.UUID]struct{}, len(instances))
	for _, instance := range instances {
		if instance.RealmID == uuid.Nil {
			return uuid.Nil, fmt.Errorf("resync log group has an instance without a realm")
		}
		if _, ok := seenRealms[instance.RealmID]; ok {
			continue
		}
		seenRealms[instance.RealmID] = struct{}{}

		realm, err := w.parent.Zed.GetWoWServerRealm(ctx, instance.RealmID)
		if err != nil {
			return uuid.Nil, fmt.Errorf("fetch realm %s for tenant scope: %w", instance.RealmID, err)
		}
		server, err := w.parent.Zed.GetWoWServer(ctx, realm.ServerID)
		if err != nil {
			return uuid.Nil, fmt.Errorf("fetch server %s for tenant scope: %w", realm.ServerID, err)
		}
		tenantIDs = append(tenantIDs, server.TenantID)
	}
	return resyncTenantID(tenantIDs)
}

func (w *WorkerResync) Work(ctx context.Context, job *river.Job[ArgsResync]) error {
	logGroupID := job.Args.LogGroupID
	adminCtx := servicetenant.AdminBypass(ctx)

	parseWorker := &WorkerLogParse{parent: w.parent}
	logGroup, err := w.parent.Zed.GetWoWLogGroupByID(adminCtx, logGroupID)
	if err != nil {
		return fmt.Errorf("fetch log group for raw-file validation: %w", err)
	}
	logFormat := logGroup.WoWLogGroup.LogType.Format()
	if logGroup.WoWLogGroup.Format.Valid {
		logFormat = logGroup.WoWLogGroup.Format.LogFormat
	}
	if logFormat == database.LogFormat112aSuperwowAddon {
		w.parent.logger.Info("skipping SuperWoW log group during resync", "log_group_id", logGroupID)
		return nil
	}
	tenantID, err := w.resolveTenantID(adminCtx, logGroupID)
	if err != nil {
		return fmt.Errorf("resolve resync tenant scope: %w", err)
	}
	var parseRealmID uuid.UUID
	if meta, metaErr := w.parent.Zed.GetServerUploadMetaRealmID(adminCtx, logGroupID); metaErr == nil && meta.Valid {
		parseRealmID = meta.UUID
	}
	files, err := w.parent.Zed.GetWoWLogFilesByGroupID(adminCtx, logGroupID)
	if err != nil {
		return fmt.Errorf("fetch raw log files for validation: %w", err)
	}
	if err := validateResyncRawFiles(adminCtx, files, 1, parseWorker.loadFileBytes); err != nil {
		return err
	}

	// Only delete parsed data after every raw file has been downloaded and
	// decompressed successfully. The parse worker downloads them again, but this
	// preflight ensures a missing or corrupt object cannot destroy the old parse.
	if err := w.parent.Zed.DeleteAllParsedLogsByGroupID(adminCtx, logGroupID); err != nil {
		return fmt.Errorf("delete parsed logs: %w", err)
	}

	// Delegate to the existing log-parse worker. We construct a synthetic
	// river.Job[ArgsLogParse] wrapping the real job row so RecordOutput and
	// other River context functions work correctly through the real River
	// context carried in ctx.
	parseCtx := ctx
	if tenantID != uuid.Nil {
		parseCtx = servicetenant.WithTenantID(parseCtx, tenantID)
	}
	parseJob := &river.Job[ArgsLogParse]{
		JobRow: job.JobRow,
		Args:   newArgsLogParse(parseCtx, logGroupID, false, false, parseRealmID),
	}

	if err := parseWorker.Work(parseCtx, parseJob); err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	return nil
}

// ResyncResult describes the outcome of resyncing a single log group.
type ResyncResult struct {
	LogGroupID    uuid.UUID
	ParseDuration time.Duration
	Err           error
}
