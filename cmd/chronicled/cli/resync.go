package cli

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynccandidate"
	"github.com/Emyrk/chronicle/cmd/chronicled/cli/resynctui"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/version"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"

	"github.com/coder/serpent"
)

const defaultResyncLogBaseURL = "https://legacy.chronicleclassic.com"

// ResyncCmd returns the CLI command for resyncing (reparsing) log groups whose
// parser version is older than a target version. By default it runs in dry-run
// mode and shows a scrollable TUI of candidates. Pass --execute to enqueue
// resync jobs on a dedicated River queue and display progress.
func ResyncCmd() *serpent.Command {
	var (
		execute       bool
		approveEach   bool
		workers       int64
		limit         int64
		targetVersion string
		pgURL         string
		remoteURL     string
		storageType   string
		storagePath   string
		s3Region      string
		s3Endpoint    string
		s3AccessKey   string
		s3SecretKey   string
		s3PathStyle   bool
		s3Bucket      string
	)

	defaultTarget := resynccandidate.DefaultTargetVersion(version.GitTag, version.GitCommit)

	options := serpent.OptionSet{
		{
			Name:        "Execute",
			Description: "Actually delete parsed data and reparse. Without this flag the command is a dry-run.",
			Flag:        "execute",
			Default:     "false",
			Value:       serpent.BoolOf(&execute),
		},
		{
			Name:        "Approve Each",
			Description: "Prompt before each log group, run exactly one isolated job, show its result, then prompt for the next.",
			Flag:        "approve-each",
			Default:     "false",
			Value:       serpent.BoolOf(&approveEach),
		},
		{
			Name:        "Workers",
			Description: "Number of concurrent resync workers.",
			Flag:        "workers",
			Default:     "1",
			Value:       serpent.Int64Of(&workers),
		},
		{
			Name:        "Limit",
			Description: "Maximum number of distinct log groups to process.",
			Flag:        "limit",
			Default:     "50",
			Value:       serpent.Int64Of(&limit),
		},
		{
			Name:        "Target Version",
			Description: "Minimum parser version. Log groups parsed by an older version are candidates. Defaults to the running binary version.",
			Flag:        "target-version",
			Default:     defaultTarget,
			Value:       serpent.StringOf(&targetVersion),
		},
		{
			Name:        "Postgres URL",
			Description: "PostgreSQL connection string.",
			Flag:        "postgres-url",
			Env:         "CHRONICLE_POSTGRES_URL",
			Default:     "postgresql://postgres:postgres@localhost:5433/chronicle?sslmode=disable",
			Value:       serpent.StringOf(&pgURL),
		},
		{
			Name:        "Storage Type",
			Description: "Storage backend: 'local' or 's3'.",
			Flag:        "storage-type",
			Env:         "CHRONICLE_STORAGE_TYPE",
			Default:     "local",
			Value:       serpent.StringOf(&storageType),
		},
		{
			Name:        "Storage Path",
			Description: "Root directory for local storage (ignored for S3).",
			Flag:        "storage-path",
			Env:         "CHRONICLE_STORAGE_PATH",
			Default:     "",
			Value:       serpent.StringOf(&storagePath),
		},
		{
			Name:        "Remote URL",
			Description: "Base URL of the remote Chronicle server. Required in --execute mode to verify the parser release version before destructive operations.",
			Flag:        "remote-url",
			Env:         "CHRONICLE_REMOTE_URL",
			Default:     "",
			Value:       serpent.StringOf(&remoteURL),
		},
		{
			Name:    "S3 Region",
			Flag:    "s3-region",
			Env:     "CHRONICLE_S3_REGION",
			Default: "",
			Value:   serpent.StringOf(&s3Region),
		},
		{
			Name:    "S3 Endpoint",
			Flag:    "s3-endpoint",
			Env:     "CHRONICLE_S3_ENDPOINT",
			Default: "",
			Value:   serpent.StringOf(&s3Endpoint),
		},
		{
			Name:    "S3 Access Key",
			Flag:    "s3-access-key",
			Env:     "CHRONICLE_S3_ACCESS_KEY",
			Default: "",
			Value:   serpent.StringOf(&s3AccessKey),
		},
		{
			Name:    "S3 Secret Key",
			Flag:    "s3-secret-key",
			Env:     "CHRONICLE_S3_SECRET_KEY",
			Default: "",
			Value:   serpent.StringOf(&s3SecretKey),
		},
		{
			Name:    "S3 Path Style",
			Flag:    "s3-path-style",
			Env:     "CHRONICLE_S3_PATH_STYLE",
			Default: "false",
			Value:   serpent.BoolOf(&s3PathStyle),
		},
		{
			Name:    "S3 Bucket",
			Flag:    "s3-bucket",
			Env:     "CHRONICLE_S3_BUCKET",
			Default: "",
			Value:   serpent.StringOf(&s3Bucket),
		},
	}

	cmd := &serpent.Command{
		Use:   "resync",
		Short: "Reparse log groups parsed by an outdated parser version",
		Long: `Reparse log groups whose parser version is older than a target version.

By default, runs in dry-run mode showing candidates. Pass --execute to enqueue
resync jobs on a dedicated River queue and display progress. Add --approve-each
to approve and inspect one isolated log group at a time before continuing.

Fail-pause behavior (--execute):
  On the first job failure (discarded/cancelled), the resync queue is paused in
  PostgreSQL. Already-running parses finish safely; no new jobs are started.

  TTY mode:  The TUI shows a PAUSED state with the error. Press 'r' to resume
             the queue and continue processing. A second failure pauses again.
             Press 'q' to quit (the queue stays paused for next run).

  Non-TTY:   The queue is paused, running jobs drain to completion, then the
             process exits nonzero. Starting the resync daemon again automatically
             resumes the persistent queue after preflight validation.`,
		Options: options,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancel := context.WithCancel(i.Context())
			defer cancel()

			logger := getLogger(i)

			if workers < 1 {
				return fmt.Errorf("workers must be at least 1")
			}
			if approveEach && !execute {
				return fmt.Errorf("--approve-each requires --execute")
			}
			if approveEach && workers != 1 {
				return fmt.Errorf("--approve-each requires --workers=1")
			}
			if limit < 0 {
				return fmt.Errorf("limit cannot be negative")
			}
			if enc := semverenc.Encode(targetVersion); enc == 0 {
				return fmt.Errorf("invalid target version: %q (cannot encode with semverenc)", targetVersion)
			}

			logger.Info("resync starting",
				slog.String("target_version", targetVersion),
				slog.Bool("execute", execute),
				slog.Bool("approve_each", approveEach),
				slog.Int64("limit", limit),
				slog.Int64("workers", workers),
				slog.String("parser_version", version.GitTag),
			)

			// Connect to Postgres — the only external dependency for dry-run.
			pool, err := pgxpool.New(ctx, pgURL)
			if err != nil {
				return fmt.Errorf("connect to postgres: %w", err)
			}
			defer pool.Close()

			dbStore := database.New(pool)

			// Query all parsed log groups with raw files still on storage.
			allRows, err := dbStore.ResyncCandidateLogGroups(ctx)
			if err != nil {
				return fmt.Errorf("query candidates: %w", err)
			}

			// Filter by semver, dedup by log group, apply limit — all in Go.
			groups := resynccandidate.FilterAndGroup(allRows, targetVersion, int(limit))

			if len(groups) == 0 {
				return writeOutput(i.Stdout, "No candidate log groups found.\n")
			}

			// Dry-run performs the same non-destructive raw-object preflight as
			// execute mode, so storage configuration is required in both modes.
			st, err := buildStorage(ctx, storageType, storagePath, s3Region, s3Endpoint, s3AccessKey, s3SecretKey, s3PathStyle, s3Bucket)
			if err != nil {
				return fmt.Errorf("init storage: %w", err)
			}
			logBaseURL := remoteURL
			if logBaseURL == "" {
				logBaseURL = defaultResyncLogBaseURL
			}
			enrichResyncGroups(ctx, dbStore, st, logBaseURL, groups)

			isTTY := isTerminal(i)

			if !execute {
				// ── Dry-run mode: database + non-destructive storage preflight ──
				if isTTY {
					m := resynctui.NewDryRunModel(groups, targetVersion)
					p := tea.NewProgram(m, tea.WithAltScreen())
					if _, err := p.Run(); err != nil {
						return fmt.Errorf("TUI: %w", err)
					}
				} else {
					if err := writeOutput(i.Stdout, "Found %d candidate log group(s) (target >= %s):\n\n", len(groups), targetVersion); err != nil {
						return err
					}
					for idx, g := range groups {
						for _, line := range g.DisplayLines(idx + 1) {
							if err := writeOutput(i.Stdout, "%s\n", line); err != nil {
								return err
							}
						}
					}
					if err := writeOutput(i.Stdout, "\nDry-run complete. Pass --execute to reparse these log groups.\n"); err != nil {
						return err
					}
				}
				return nil
			}

			// ── Execute mode ─────────────────────────────────────────
			// Remote version guard: must match before any destructive work.
			if remoteURL == "" {
				return fmt.Errorf("--remote-url is required in --execute mode")
			}
			if err := checkRemoteParserVersion(ctx, remoteURL); err != nil {
				return fmt.Errorf("remote version check: %w", err)
			}
			logger.Info("remote parser version verified", "remote_url", remoteURL)

			// Construct a minimal Chronicle instance. Only Postgres,
			// storage, and DB-backed game data are required.
			// Resync uses DatabaseSpellsOnly mode: no Spell.dbc file needed;
			// all spell data comes from the realm-resolved dataset in PostgreSQL.
			noopZed := authz.NewDatabaseOnly(logger, dbStore)
			wowDB, err := gamedb.New(ctx, gamedb.Options{
				DatabaseSpellsOnly: true,
				DB:                 noopZed,
				Pool:               pool,
				DatasetID:          servicedataset.DefaultDatasetID,
				CacheSvc:           nil, // Nil is fine — caches work without metrics.
			})
			if err != nil {
				return fmt.Errorf("init game db: %w", err)
			}

			// Validate that every realm/dataset represented by the candidates
			// has imported DB spells. Fail before any destructive work.
			if err := validateDatasetSpells(ctx, logger, dbStore, wowDB, groups); err != nil {
				return err
			}

			chron, err := chronicle.New(ctx, logger, chronicle.Options{
				Storage:          st,
				Zed:              noopZed,
				WoWDB:            wowDB,
				DefaultFlavor:    servicechronicle.BuildTagFlavor(),
				DefaultDatasetID: servicedataset.DefaultDatasetID,
				ResolveDataset: func(ctx context.Context, realmID uuid.UUID) chronicle.ResolvedDataset {
					return resolveDatasetForRealm(ctx, dbStore, realmID)
				},
			})
			if err != nil {
				return fmt.Errorf("create chronicle: %w", err)
			}

			// Set up a dedicated River client. Normal execution uses the persistent
			// resync queue. Approval mode uses a unique queue for this invocation so
			// old or concurrently queued resync jobs cannot run between approvals.
			queueName := riverconst.QueueResync
			maxWorkers := int(workers)
			if approveEach {
				queueName = "resync-approve-" + uuid.NewString()
				maxWorkers = 1
			}
			parseQueueName := queueName + "-log-parse"
			riverWorkers := river.NewWorkers()
			river.AddWorker(riverWorkers, chron.NewWorkerResync(parseQueueName))
			river.AddWorker(riverWorkers, chron.NewWorkerLogParse())

			riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
				Queues: map[string]river.QueueConfig{
					queueName:      {MaxWorkers: maxWorkers},
					parseQueueName: {MaxWorkers: maxWorkers},
				},
				Workers:                     riverWorkers,
				Middleware:                  riverqueue.WorkerMiddleware(logger),
				Logger:                      leveledlog.New(logger.With(slog.String("service", "river-resync")), slog.LevelWarn),
				CompletedJobRetentionPeriod: 24 * time.Hour,
				JobTimeout:                  30 * time.Minute,
			})
			if err != nil {
				return fmt.Errorf("create river client: %w", err)
			}

			// WorkerLogParse uses Chronicle's queue for normal downstream work (for
			// example parse-score jobs) and for River job inspection. The wrapper uses
			// the same client but does not add any production queues to this worker.
			chron.SetQueue(&riverqueue.Queues{Client: riverClient})

			if approveEach {
				if err := riverClient.Start(ctx); err != nil {
					return fmt.Errorf("start approval River client: %w", err)
				}
				defer stopRiverClient(riverClient)
				return runApproveEach(ctx, i, riverClient, queueName, groups)
			}

			// Enqueue one resync job per candidate log group.
			jobIDs := make(map[int64]uuid.UUID, len(groups))
			for _, g := range groups {
				res, err := riverClient.Insert(ctx, chronicle.ArgsResync{LogGroupID: g.ID}, nil)
				if err != nil {
					return fmt.Errorf("enqueue resync job for %s: %w", g.ID, err)
				}
				jobIDs[res.Job.ID] = g.ID
			}

			// Starting the resync daemon always resumes the persistent queue. This
			// happens after all preflight checks and job insertion, but before workers
			// begin claiming jobs.
			if err := riverClient.QueueResume(ctx, riverconst.QueueResync, nil); err != nil && !errors.Is(err, rivertype.ErrNotFound) {
				return fmt.Errorf("auto-resume resync queue: %w", err)
			}
			logger.Info("resync queue ready", "auto_resumed", true)

			// Start the River client to begin processing jobs.
			if err := riverClient.Start(ctx); err != nil {
				return fmt.Errorf("start river client: %w", err)
			}
			defer stopRiverClient(riverClient)

			if isTTY {
				return runActiveTUI(ctx, riverClient, groups, jobIDs, int(workers))
			}
			return runActivePlain(ctx, i, riverClient, groups, jobIDs)
		},
	}

	return cmd
}

func enrichResyncGroups(
	ctx context.Context,
	db database.Store,
	objectStorage storage.ObjectStorage,
	remoteURL string,
	groups []resynccandidate.Group,
) {
	adminCtx := servicetenant.AdminBypass(ctx)
	for idx := range groups {
		group := &groups[idx]
		group.ExpectedFiles = chronicle.ExpectedRawLogFiles(group.LogFormat)

		files, err := db.GetWoWLogFilesByGroupID(adminCtx, group.ID)
		if err != nil {
			group.StorageError = fmt.Sprintf("fetch raw file records: %v", err)
		} else {
			available := chronicle.AvailableRawLogFiles(files)
			group.RawFileCount = len(available)
			if err := chronicle.ValidateResyncRawFiles(adminCtx, objectStorage, available, group.LogFormat); err != nil {
				group.StorageError = err.Error()
			} else {
				group.StorageValid = true
			}
		}

		tenantIDs := make(map[uuid.UUID]struct{})
		rootScoped := false
		for _, realmID := range group.RealmIDs {
			realm, err := db.GetWoWServerRealm(adminCtx, realmID)
			if err != nil {
				group.StorageValid = false
				group.StorageError = appendPreflightError(group.StorageError, fmt.Sprintf("resolve realm %s: %v", realmID, err))
				continue
			}
			server, err := db.GetWoWServer(adminCtx, realm.ServerID)
			if err != nil {
				group.StorageValid = false
				group.StorageError = appendPreflightError(group.StorageError, fmt.Sprintf("resolve server %s: %v", realm.ServerID, err))
				continue
			}
			if server.TenantID.Valid {
				tenantIDs[server.TenantID.UUID] = struct{}{}
			} else {
				rootScoped = true
			}
		}

		switch {
		case rootScoped && len(tenantIDs) > 0, len(tenantIDs) > 1:
			group.TenantName = "mixed/invalid"
			group.StorageValid = false
			group.StorageError = appendPreflightError(group.StorageError, "log group spans multiple tenant scopes")
		case len(tenantIDs) == 1:
			for tenantID := range tenantIDs {
				tenant, err := db.GetTenantByID(adminCtx, tenantID)
				if err != nil {
					group.TenantName = tenantID.String()
					group.StorageValid = false
					group.StorageError = appendPreflightError(group.StorageError, fmt.Sprintf("resolve tenant %s: %v", tenantID, err))
					break
				}
				group.TenantName = tenant.Name
				group.TenantIncludeAll = tenant.IncludeInAll
				if tenant.Slug.Valid {
					group.TenantSlug = tenant.Slug.String
				}
			}
		default:
			group.TenantName = "root/legacy"
			group.TenantIncludeAll = true
		}
		group.LogURL = resyncLogURL(remoteURL, group.TenantSlug, group.ID)
	}
}

func appendPreflightError(existing, next string) string {
	if existing == "" {
		return next
	}
	return existing + "; " + next
}

func resyncLogURL(remoteURL, tenantSlug string, logGroupID uuid.UUID) string {
	if remoteURL == "" {
		return ""
	}
	parsed, err := url.Parse(remoteURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}

	if tenantSlug != "" {
		hostname := parsed.Hostname()
		labels := strings.Split(hostname, ".")
		if len(labels) >= 3 {
			hostname = tenantSlug + "." + strings.Join(labels[1:], ".")
		} else if len(labels) == 2 {
			hostname = tenantSlug + "." + hostname
		}
		if port := parsed.Port(); port != "" {
			parsed.Host = net.JoinHostPort(hostname, port)
		} else {
			parsed.Host = hostname
		}
	}

	parsed.Path = "/logs/" + logGroupID.String()
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String()
}

type approvalAction int

const (
	approvalSkip approvalAction = iota
	approvalRun
	approvalQuit
)

func stopRiverClient(client *river.Client[pgx.Tx]) {
	stopCtx, stopCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer stopCancel()
	_ = client.StopAndCancel(stopCtx)
}

func promptApproval(scanner *bufio.Scanner, out io.Writer, group resynccandidate.Group, index, total int) (approvalAction, error) {
	if err := writeOutput(out, "\nCandidate %d/%d\n", index, total); err != nil {
		return approvalQuit, err
	}
	for _, line := range group.DisplayLines(index) {
		if err := writeOutput(out, "%s\n", line); err != nil {
			return approvalQuit, err
		}
	}
	for {
		if err := writeOutput(out, "Reparse this log group? [y]es / [n]o, skip / [q]uit: "); err != nil {
			return approvalQuit, err
		}
		if !scanner.Scan() {
			if err := scanner.Err(); err != nil {
				return approvalQuit, fmt.Errorf("read approval: %w", err)
			}
			return approvalQuit, nil
		}
		switch strings.ToLower(strings.TrimSpace(scanner.Text())) {
		case "y", "yes":
			return approvalRun, nil
		case "", "n", "no", "skip":
			return approvalSkip, nil
		case "q", "quit":
			return approvalQuit, nil
		default:
			if err := writeOutput(out, "Please enter y, n, or q.\n"); err != nil {
				return approvalQuit, err
			}
		}
	}
}

func waitForApprovedJob(ctx context.Context, client *river.Client[pgx.Tx], jobID int64) (*rivertype.JobRow, error) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		job, err := client.JobGet(ctx, jobID)
		if err != nil {
			return nil, fmt.Errorf("fetch approval job %d: %w", jobID, err)
		}
		switch job.State {
		case rivertype.JobStateCompleted, rivertype.JobStateDiscarded, rivertype.JobStateCancelled:
			return job, nil
		case rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRetryable,
			rivertype.JobStateRunning, rivertype.JobStateScheduled:
		default:
			return nil, fmt.Errorf("approval job %d entered unexpected state %q", jobID, job.State)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

func approvalInsertOpts(args chronicle.ArgsResync, queueName string) river.InsertOpts {
	opts := args.InsertOpts()
	opts.Queue = queueName
	opts.UniqueOpts.ByQueue = true
	return opts
}

func runApproveEach(ctx context.Context, i *serpent.Invocation, client *river.Client[pgx.Tx], queueName string, groups []resynccandidate.Group) error {
	scanner := bufio.NewScanner(i.Stdin)
	completed := 0
	skipped := 0
	for index, group := range groups {
		action, err := promptApproval(scanner, i.Stdout, group, index+1, len(groups))
		if err != nil {
			return err
		}
		switch action {
		case approvalQuit:
			return writeOutput(i.Stdout, "\nStopped. %d completed, %d skipped, %d remaining.\n", completed, skipped, len(groups)-index)
		case approvalSkip:
			skipped++
			if err := writeOutput(i.Stdout, "Skipped %s; existing parsed data was not changed.\n", group.ID); err != nil {
				return err
			}
			continue
		case approvalRun:
		}

		args := chronicle.ArgsResync{LogGroupID: group.ID}
		insertOpts := approvalInsertOpts(args, queueName)
		res, err := client.Insert(ctx, args, &insertOpts)
		if err != nil {
			return fmt.Errorf("enqueue approved resync job for %s: %w", group.ID, err)
		}
		if err := writeOutput(i.Stdout, "Running %s...\n", group.ID); err != nil {
			return err
		}
		job, err := waitForApprovedJob(ctx, client, res.Job.ID)
		if err != nil {
			return err
		}
		if job.State != rivertype.JobStateCompleted {
			errMsg := "unknown error"
			if len(job.Errors) > 0 {
				errMsg = job.Errors[len(job.Errors)-1].Error
			}
			return fmt.Errorf("resync %s %s: %s", group.ID, job.State, errMsg)
		}
		completed++
		if err := writeOutput(i.Stdout, "Completed %s successfully. Inspect the result before approving the next candidate.\n", group.ID); err != nil {
			return err
		}
	}
	return writeOutput(i.Stdout, "\nApproval run complete: %d completed, %d skipped.\n", completed, skipped)
}

// buildStorage constructs the ObjectStorage backend from CLI flags.
func buildStorage(ctx context.Context, storageType, storagePath, s3Region, s3Endpoint, s3AccessKey, s3SecretKey string, s3PathStyle bool, s3Bucket string) (storage.ObjectStorage, error) {
	switch storageType {
	case "local":
		if storagePath != "" {
			return storage.NewLocalStorageAt(storagePath)
		}
		return storage.NewLocalStorage()
	case "s3":
		return storage.NewS3Storage(ctx, storage.S3Options{
			Region:          s3Region,
			Endpoint:        s3Endpoint,
			AccessKeyID:     s3AccessKey,
			SecretAccessKey: s3SecretKey,
			UsePathStyle:    s3PathStyle,
			Bucket:          s3Bucket,
		})
	default:
		return nil, fmt.Errorf("unsupported storage type: %q (valid: local, s3)", storageType)
	}
}

// isTerminal returns true if stdout appears to be a TTY.
func isTerminal(i *serpent.Invocation) bool {
	f, ok := i.Stdout.(*os.File)
	if !ok {
		return false
	}
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return (info.Mode() & os.ModeCharDevice) != 0
}

// runActiveTUI runs the Bubble Tea active-mode TUI and polls River job
// states until all jobs reach terminal states. On the first failure the
// queue is paused and the TUI enters a PAUSED state. The operator can
// press 'r' to resume (calls QueueResume); a second failure pauses again.
// Already-running parses finish safely — only new job fetches are blocked.
func runActiveTUI(ctx context.Context, client *river.Client[pgx.Tx], groups []resynccandidate.Group, jobIDs map[int64]uuid.UUID, workers int) error {
	var queuePaused atomic.Bool
	m := resynctui.NewActiveModel(groups, workers)
	m.ResumeFunc = func() error {
		if err := client.QueueResume(ctx, riverconst.QueueResync, nil); err != nil {
			return err
		}
		queuePaused.Store(false)
		return nil
	}
	p := tea.NewProgram(m, tea.WithAltScreen())

	go pollJobStates(ctx, p, client, jobIDs, &queuePaused)

	final, err := p.Run()
	if err != nil {
		return fmt.Errorf("TUI: %w", err)
	}
	fm, ok := final.(resynctui.ActiveModel)
	if !ok {
		return fmt.Errorf("TUI returned unexpected model %T", final)
	}
	if !fm.Done {
		return fmt.Errorf("resync interrupted with jobs still pending")
	}
	if failed := fm.FailedCount(); failed > 0 {
		return fmt.Errorf("%d log group(s) failed to resync", failed)
	}
	return nil
}

func writeOutput(w io.Writer, format string, args ...any) error {
	if _, err := fmt.Fprintf(w, format, args...); err != nil {
		return fmt.Errorf("write command output: %w", err)
	}
	return nil
}

// runActivePlain prints plain-text progress for non-TTY environments.
// On the first failure it pauses the queue, waits for already-running jobs
// to reach terminal state, then exits nonzero with instructions to rerun
// by starting the resync daemon again, which automatically resumes the queue.
func runActivePlain(ctx context.Context, i *serpent.Invocation, client *river.Client[pgx.Tx], groups []resynccandidate.Group, jobIDs map[int64]uuid.UUID) error {
	if err := writeOutput(i.Stdout, "Executing resync for %d log group(s)...\n", len(groups)); err != nil {
		return err
	}

	pending := make(map[int64]bool, len(jobIDs))
	for id := range jobIDs {
		pending[id] = true
	}

	var completed, failed int
	paused := false
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for len(pending) > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}

		running := 0
		for jobID, lgID := range jobIDs {
			if !pending[jobID] {
				continue
			}
			job, err := client.JobGet(ctx, jobID)
			if err != nil {
				continue
			}
			switch job.State {
			case rivertype.JobStateRunning:
				running++
			case rivertype.JobStateCompleted:
				completed++
				delete(pending, jobID)
				if err := writeOutput(i.Stdout, "  ✓ %s\n", lgID); err != nil {
					return err
				}
			case rivertype.JobStateDiscarded, rivertype.JobStateCancelled:
				failed++
				delete(pending, jobID)
				errMsg := ""
				if len(job.Errors) > 0 {
					errMsg = job.Errors[len(job.Errors)-1].Error
				}
				if err := writeOutput(i.Stderr, "  ✗ %s: %s\n", lgID, errMsg); err != nil {
					return err
				}

				// Pause queue on first failure. Already-running parses
				// finish safely; only new job fetches are blocked.
				if !paused {
					if pauseErr := client.QueuePause(ctx, riverconst.QueueResync, nil); pauseErr != nil {
						if err := writeOutput(i.Stderr, "warning: failed to pause queue: %v\n", pauseErr); err != nil {
							return err
						}
					} else {
						paused = true
						if err := writeOutput(i.Stderr, "\nQueue paused after failure. Waiting for running jobs to finish...\n"); err != nil {
							return err
						}
					}
				}
			}
		}
		if paused && running == 0 {
			if err := writeOutput(i.Stderr, "\nThe resync queue is PAUSED. Restart the resync daemon after investigating the failure; startup auto-resumes the queue:\n"); err != nil {
				return err
			}
			if err := writeOutput(i.Stderr, "  chronicled resync --execute [...other flags]\n\n"); err != nil {
				return err
			}
			return fmt.Errorf("resync paused after %d failure(s); %d job(s) remain queued", failed, len(pending))
		}
	}

	if err := writeOutput(i.Stdout, "\nResync complete: %d succeeded, %d failed out of %d total.\n", completed, failed, len(jobIDs)); err != nil {
		return err
	}
	if failed > 0 {
		if paused {
			if err := writeOutput(i.Stderr, "\nThe resync queue is now PAUSED. Restart the resync daemon after investigating the failure; startup auto-resumes the queue:\n"); err != nil {
				return err
			}
			if err := writeOutput(i.Stderr, "  chronicled resync --execute [...other flags]\n\n"); err != nil {
				return err
			}
		}
		return fmt.Errorf("%d log group(s) failed to resync", failed)
	}
	return nil
}

// pollJobStates periodically checks River job states and sends TUI messages.
// On the first failure it pauses the queue via QueuePause. Already-running
// parses finish safely; only new job fetches are blocked. The TUI shows a
// PAUSED state and waits for the operator to press 'r'.
func pollJobStates(ctx context.Context, p *tea.Program, client *river.Client[pgx.Tx], jobIDs map[int64]uuid.UUID, queuePaused *atomic.Bool) {
	pending := make(map[int64]bool, len(jobIDs))
	for id := range jobIDs {
		pending[id] = true
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		for jobID, lgID := range jobIDs {
			if !pending[jobID] {
				continue
			}
			job, err := client.JobGet(ctx, jobID)
			if err != nil {
				continue
			}
			switch job.State {
			case rivertype.JobStateRunning:
				p.Send(resynctui.JobUpdateMsg{
					LogGroupID: lgID,
					State:      resynctui.JobRunning,
				})
			case rivertype.JobStateCompleted:
				p.Send(resynctui.JobUpdateMsg{
					LogGroupID: lgID,
					State:      resynctui.JobCompleted,
				})
				delete(pending, jobID)
			case rivertype.JobStateDiscarded, rivertype.JobStateCancelled:
				errMsg := "failed"
				if len(job.Errors) > 0 {
					errMsg = job.Errors[len(job.Errors)-1].Error
				}
				p.Send(resynctui.JobUpdateMsg{
					LogGroupID: lgID,
					State:      resynctui.JobFailed,
					Error:      errMsg,
				})
				delete(pending, jobID)

				// Pause on first failure. QueuePause persists in
				// PostgreSQL and stops new job fetches immediately.
				if queuePaused.CompareAndSwap(false, true) {
					if err := client.QueuePause(ctx, riverconst.QueueResync, nil); err != nil {
						queuePaused.Store(false)
						p.Send(resynctui.QueueResumeFailedMsg{Error: fmt.Sprintf("pause failed: %v", err)})
					} else {
						p.Send(resynctui.QueuePausedMsg{
							FailedLogGroupID: lgID,
							Error:            errMsg,
						})
					}
				}
			}
		}

		if len(pending) == 0 {
			p.Send(resynctui.AllDoneMsg{})
			if !queuePaused.Load() {
				return
			}
		}
	}
}

// resolveDatasetForRealm mirrors the server's dataset resolution used during
// parsing: realm server override, then tenant override, then the default dataset.
func resolveDatasetForRealm(ctx context.Context, db database.Store, realmID uuid.UUID) chronicle.ResolvedDataset {
	row, err := db.ResolveDatasetWithFlavorByRealm(ctx, realmID)
	if err == nil {
		return chronicle.ResolvedDataset{
			DatasetID: row.DatasetID,
			Flavor:    database.FlavorFromStrings(row.DefaultFlavor),
		}
	}

	dataset, datasetErr := db.GetDataset(ctx, servicedataset.DefaultDatasetID)
	if datasetErr != nil {
		return chronicle.ResolvedDataset{DatasetID: servicedataset.DefaultDatasetID}
	}
	return chronicle.ResolvedDataset{
		DatasetID: servicedataset.DefaultDatasetID,
		Flavor:    database.FlavorFromStrings(dataset.DefaultFlavor),
	}
}

// validateDatasetSpells resolves every distinct realm across the candidate
// groups to its dataset and verifies that each dataset has imported DB spells.
// This must pass before any destructive work in DB-only mode.
func validateDatasetSpells(ctx context.Context, logger *slog.Logger, db database.Store, wowDB *gamedb.WoWDB, groups []resynccandidate.Group) error {
	// Collect distinct realm IDs across all candidate groups.
	realmSet := make(map[uuid.UUID]bool)
	for _, g := range groups {
		for _, rid := range g.RealmIDs {
			realmSet[rid] = true
		}
	}

	if len(realmSet) == 0 {
		// No existing instances → parsing will resolve realm from raw data
		// and the dataset resolver will produce the default dataset. Verify
		// the default dataset has imported spells.
		has, err := wowDB.DatasetHasDBSpells(ctx, servicedataset.DefaultDatasetID)
		if err != nil {
			return fmt.Errorf("validate default dataset spells: %w", err)
		}
		if !has {
			return fmt.Errorf("default dataset %s has no imported DB spells; cannot resync in DB-only mode", servicedataset.DefaultDatasetID)
		}
		return nil
	}

	// Resolve each realm to its dataset and check.
	checked := make(map[uuid.UUID]bool) // dataset ID -> already verified
	for realmID := range realmSet {
		dsID := resolveDatasetForRealm(ctx, db, realmID).DatasetID

		if checked[dsID] {
			continue
		}

		has, err := wowDB.DatasetHasDBSpells(ctx, dsID)
		if err != nil {
			return fmt.Errorf("validate dataset %s spells (realm %s): %w", dsID, realmID, err)
		}
		if !has {
			return fmt.Errorf("dataset %s (realm %s) has no imported DB spells; cannot resync in DB-only mode", dsID, realmID)
		}
		checked[dsID] = true
		logger.Info("dataset spell validation passed", "dataset_id", dsID, "realm_id", realmID)
	}

	return nil
}
