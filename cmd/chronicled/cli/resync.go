package cli

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync/atomic"
	"time"

	"github.com/Emyrk/chronicle/chronicle"
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

// ResyncCmd returns the CLI command for resyncing (reparsing) log groups whose
// parser version is older than a target version. By default it runs in dry-run
// mode and shows a scrollable TUI of candidates. Pass --execute to enqueue
// resync jobs on a dedicated River queue and display progress.
func ResyncCmd() *serpent.Command {
	var (
		execute       bool
		resume        bool
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
			Name:        "Resume",
			Description: "Resume a previously paused resync queue. Required in non-TTY mode after a failure paused the queue. Without this flag, if the queue is already paused the command exits immediately with instructions.",
			Flag:        "resume",
			Default:     "false",
			Value:       serpent.BoolOf(&resume),
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
			Description: "Base URL of the remote Chronicle server. Required in --execute mode to verify parser version match before destructive operations.",
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
resync jobs on a dedicated River queue and display progress.

Fail-pause behavior (--execute):
  On the first job failure (discarded/cancelled), the resync queue is paused in
  PostgreSQL. Already-running parses finish safely; no new jobs are started.
  
  TTY mode:  The TUI shows a PAUSED state with the error. Press 'r' to resume
             the queue and continue processing. A second failure pauses again.
             Press 'q' to quit (the queue stays paused for next run).
  
  Non-TTY:   The queue is paused, running jobs drain to completion, then the
             process exits nonzero. Rerun with --resume to explicitly resume.

  --resume:  Explicitly calls QueueResume before processing. Without --resume,
             if the queue is already paused from a previous failure, the command
             exits immediately with instructions.`,
		Options: options,
		Handler: func(i *serpent.Invocation) error {
			ctx, cancel := context.WithCancel(i.Context())
			defer cancel()

			logger := getLogger(i)

			if workers < 1 {
				return fmt.Errorf("workers must be at least 1")
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
				fmt.Fprintln(i.Stdout, "No candidate log groups found.")
				return nil
			}

			isTTY := isTerminal(i)

			if !execute {
				// ── Dry-run mode: query-only, no storage/Chronicle init ──
				if isTTY {
					m := resynctui.NewDryRunModel(groups, targetVersion)
					p := tea.NewProgram(m, tea.WithAltScreen())
					if _, err := p.Run(); err != nil {
						return fmt.Errorf("TUI: %w", err)
					}
				} else {
					fmt.Fprintf(i.Stdout, "Found %d candidate log group(s) (target >= %s):\n\n", len(groups), targetVersion)
					for idx, g := range groups {
						fmt.Fprintf(i.Stdout, "  %d. %s  parser=%s  instances=%d\n", idx+1, g.ID, g.ParserVersion, len(g.Instances))
						for _, inst := range g.Instances {
							fmt.Fprintf(i.Stdout, "       - %s\n", inst)
						}
					}
					fmt.Fprintf(i.Stdout, "\nDry-run complete. Pass --execute to reparse these log groups.\n")
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

			// Build storage backend (needed for file download during parsing).
			st, err := buildStorage(ctx, storageType, storagePath, s3Region, s3Endpoint, s3AccessKey, s3SecretKey, s3PathStyle, s3Bucket)
			if err != nil {
				return fmt.Errorf("init storage: %w", err)
			}

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

			// Set up a dedicated River client that only processes the
			// "resync" queue. The main server never registers/consumes
			// this queue, so jobs are fully isolated.
			riverWorkers := river.NewWorkers()
			river.AddWorker(riverWorkers, chron.NewWorkerResync())

			riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
				Queues: map[string]river.QueueConfig{
					riverconst.QueueResync: {MaxWorkers: int(workers)},
				},
				Workers:                     riverWorkers,
				Logger:                      leveledlog.New(logger.With(slog.String("service", "river-resync")), slog.LevelWarn),
				CompletedJobRetentionPeriod: 24 * time.Hour,
				JobTimeout:                  30 * time.Minute,
			})
			if err != nil {
				return fmt.Errorf("create river client: %w", err)
			}

			// Handle --resume: explicitly resume a previously paused queue.
			if resume {
				if err := riverClient.QueueResume(ctx, riverconst.QueueResync, nil); err != nil {
					return fmt.Errorf("resume queue: %w", err)
				}
				logger.Info("resumed paused resync queue")
			} else {
				// Fail fast if queue is already paused from a previous run.
				q, err := riverClient.QueueGet(ctx, riverconst.QueueResync)
				if err == nil && q.PausedAt != nil {
					return fmt.Errorf(
						"resync queue is paused (since %s) from a previous failure; "+
							"pass --resume to explicitly resume, or investigate the failure first",
						q.PausedAt.Format(time.RFC3339),
					)
				}
				// ErrNotFound is fine — queue doesn't exist yet.
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

			// Start the River client to begin processing jobs.
			if err := riverClient.Start(ctx); err != nil {
				return fmt.Errorf("start river client: %w", err)
			}
			defer func() {
				stopCtx, stopCancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer stopCancel()
				_ = riverClient.StopAndCancel(stopCtx)
			}()

			if isTTY {
				return runActiveTUI(ctx, riverClient, groups, jobIDs, int(workers))
			}
			return runActivePlain(ctx, i, riverClient, groups, jobIDs)
		},
	}

	return cmd
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

// runActivePlain prints plain-text progress for non-TTY environments.
// On the first failure it pauses the queue, waits for already-running jobs
// to reach terminal state, then exits nonzero with instructions to rerun
// using --resume.
func runActivePlain(ctx context.Context, i *serpent.Invocation, client *river.Client[pgx.Tx], groups []resynccandidate.Group, jobIDs map[int64]uuid.UUID) error {
	fmt.Fprintf(i.Stdout, "Executing resync for %d log group(s)...\n", len(groups))

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
				fmt.Fprintf(i.Stdout, "  ✓ %s\n", lgID)
			case rivertype.JobStateDiscarded, rivertype.JobStateCancelled:
				failed++
				delete(pending, jobID)
				errMsg := ""
				if len(job.Errors) > 0 {
					errMsg = job.Errors[len(job.Errors)-1].Error
				}
				fmt.Fprintf(i.Stderr, "  ✗ %s: %s\n", lgID, errMsg)

				// Pause queue on first failure. Already-running parses
				// finish safely; only new job fetches are blocked.
				if !paused {
					if pauseErr := client.QueuePause(ctx, riverconst.QueueResync, nil); pauseErr != nil {
						fmt.Fprintf(i.Stderr, "warning: failed to pause queue: %v\n", pauseErr)
					} else {
						paused = true
						fmt.Fprintf(i.Stderr, "\nQueue paused after failure. Waiting for running jobs to finish...\n")
					}
				}
			}
		}
		if paused && running == 0 {
			fmt.Fprintf(i.Stderr, "\nThe resync queue is PAUSED. To retry and resume, rerun with --resume:\n")
			fmt.Fprintf(i.Stderr, "  chronicled resync --execute --resume [...other flags]\n\n")
			return fmt.Errorf("resync paused after %d failure(s); %d job(s) remain queued", failed, len(pending))
		}
	}

	fmt.Fprintf(i.Stdout, "\nResync complete: %d succeeded, %d failed out of %d total.\n", completed, failed, len(jobIDs))
	if failed > 0 {
		if paused {
			fmt.Fprintf(i.Stderr, "\nThe resync queue is now PAUSED. To resume, rerun with --resume:\n")
			fmt.Fprintf(i.Stderr, "  chronicled resync --execute --resume [...other flags]\n\n")
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
