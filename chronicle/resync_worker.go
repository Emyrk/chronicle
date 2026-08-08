package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
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

// WorkerResync validates and deletes previously parsed data, then enqueues a
// real ArgsLogParse job on an isolated queue and waits for it to finish.
type WorkerResync struct {
	parent     *Chronicle
	parseQueue string
	river.WorkerDefaults[ArgsResync]
}

// Timeout is unlimited because the wrapper waits for a real log-parse job,
// including that worker's own timeout and retry policy. The child job remains
// the source of truth for parse execution limits.
func (w *WorkerResync) Timeout(*river.Job[ArgsResync]) time.Duration {
	return -1
}

func (c *Chronicle) NewWorkerResync(parseQueue string) *WorkerResync {
	return &WorkerResync{parent: c, parseQueue: parseQueue}
}

// ExpectedRawLogFiles returns the number of objects required to parse a log
// group in the given format.
func ExpectedRawLogFiles(logFormat database.LogFormat) int {
	if logFormat == database.LogFormat112aSuperwowAddon {
		return 2
	}
	return 1
}

func loadRawLogFile(ctx context.Context, objectStorage storage.ObjectStorage, file database.LogFile) (io.Reader, error) {
	fileData, err := objectStorage.DownloadFile(ctx, BucketRaidLogs, filepath.Join("logs", file.ID.String()))
	if err != nil {
		err = fmt.Errorf("download log file %s: %w", file.ID, err)
		if errors.Is(err, io.ErrUnexpectedEOF) {
			err = fmt.Errorf("download log file %s (unexpected EOF — file may be truncated): %w", file.ID, err)
		}
		return nil, err
	}

	var reader io.Reader = bytes.NewReader(fileData)
	if file.ContentEncoding.Valid && file.ContentEncoding.String == "gzip" {
		gzReader, err := gzip.NewReader(reader)
		if err != nil {
			return nil, fmt.Errorf("decompress log file %s: %w", file.ID, err)
		}
		defer func() { _ = gzReader.Close() }()

		decompressed := &bytes.Buffer{}
		if _, err := io.Copy(decompressed, gzReader); err != nil {
			return nil, fmt.Errorf("read decompressed log file %s: %w", file.ID, err)
		}
		reader = decompressed
	}

	return reader, nil
}

func loadRawLogFileBytes(ctx context.Context, objectStorage storage.ObjectStorage, file database.LogFile) ([]byte, error) {
	reader, err := loadRawLogFile(ctx, objectStorage, file)
	if err != nil {
		return nil, err
	}
	buf := &bytes.Buffer{}
	if _, err := io.Copy(buf, reader); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// AvailableRawLogFiles filters out database records whose storage objects are
// already marked deleted.
func AvailableRawLogFiles(files []database.LogFile) []database.LogFile {
	available := make([]database.LogFile, 0, len(files))
	for _, file := range files {
		if !file.StorageDeletedAt.Valid {
			available = append(available, file)
		}
	}
	return available
}

// ValidateResyncRawFiles downloads and decompresses every raw log object and
// verifies that the group has the number of files required by its format.
func ValidateResyncRawFiles(ctx context.Context, objectStorage storage.ObjectStorage, files []database.LogFile, logFormat database.LogFormat) error {
	return validateResyncRawFiles(ctx, files, ExpectedRawLogFiles(logFormat), func(ctx context.Context, file database.LogFile) ([]byte, error) {
		return loadRawLogFileBytes(ctx, objectStorage, file)
	})
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

func resyncParseInsertOpts(args ArgsLogParse, parseQueue string) river.InsertOpts {
	opts := args.InsertOpts()
	opts.Queue = parseQueue
	opts.Pending = true
	// The isolated parse must not reuse an active job from the production
	// log-parsing queue merely because its args are identical.
	opts.UniqueOpts.ByQueue = true
	return opts
}

func (w *WorkerResync) waitForParse(ctx context.Context, jobID int64) (*rivertype.JobRow, error) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		job, err := w.parent.queue.JobGet(ctx, jobID)
		if err != nil {
			return nil, fmt.Errorf("fetch isolated log-parse job %d: %w", jobID, err)
		}
		switch job.State {
		case rivertype.JobStateCompleted, rivertype.JobStateDiscarded, rivertype.JobStateCancelled:
			return job, nil
		case rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRetryable,
			rivertype.JobStateRunning, rivertype.JobStateScheduled:
		default:
			return nil, fmt.Errorf("isolated log-parse job %d entered unexpected state %q", jobID, job.State)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func (w *WorkerResync) Work(ctx context.Context, job *river.Job[ArgsResync]) error {
	logGroupID := job.Args.LogGroupID
	adminCtx := servicetenant.AdminBypass(ctx)

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
	if err := ValidateResyncRawFiles(adminCtx, w.parent.Storage, AvailableRawLogFiles(files), logFormat); err != nil {
		return err
	}

	if w.parent.queue == nil {
		return fmt.Errorf("isolated log-parse queue is not configured")
	}
	parseCtx := ctx
	if tenantID != uuid.Nil {
		parseCtx = servicetenant.WithTenantID(parseCtx, tenantID)
	}
	parseArgs := newArgsLogParse(parseCtx, logGroupID, false, false, parseRealmID)
	insertOpts := resyncParseInsertOpts(parseArgs, w.parseQueue)
	parseInsert, err := w.parent.queue.Insert(parseCtx, parseArgs, &insertOpts)
	if err != nil {
		return fmt.Errorf("stage isolated log-parse job: %w", err)
	}

	if parseInsert.UniqueSkippedAsDuplicate {
		return fmt.Errorf("active isolated log-parse job %d already exists for log group %s", parseInsert.Job.ID, logGroupID)
	}

	// Only delete parsed data after every raw file has been downloaded and a
	// real River log-parse job has been staged successfully. The pending job
	// cannot run until it is explicitly released below.
	if err := w.parent.Zed.DeleteAllParsedLogsByGroupID(adminCtx, logGroupID); err != nil {
		_, _ = w.parent.queue.JobDelete(adminCtx, parseInsert.Job.ID)
		return fmt.Errorf("delete parsed logs: %w", err)
	}
	if _, err := w.parent.queue.JobRetry(parseCtx, parseInsert.Job.ID); err != nil {
		return fmt.Errorf("release isolated log-parse job %d: %w", parseInsert.Job.ID, err)
	}

	parseJob, err := w.waitForParse(parseCtx, parseInsert.Job.ID)
	if err != nil {
		return err
	}
	_ = river.RecordOutput(ctx, map[string]any{"log_parse_job_id": parseInsert.Job.ID})
	if parseJob.State != rivertype.JobStateCompleted {
		errMsg := "unknown error"
		if len(parseJob.Errors) > 0 {
			errMsg = parseJob.Errors[len(parseJob.Errors)-1].Error
		}
		return fmt.Errorf("isolated log-parse job %d %s: %s", parseJob.ID, parseJob.State, errMsg)
	}
	return nil
}

// ResyncResult describes the outcome of resyncing a single log group.
type ResyncResult struct {
	LogGroupID    uuid.UUID
	ParseDuration time.Duration
	Err           error
}
