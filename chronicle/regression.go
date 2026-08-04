package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"reflect"

	"github.com/Emyrk/chronicle/chronicle/regression"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindRegressionSnapshot = "regression-snapshot"

type ArgsRegressionSnapshot struct {
	FixtureID uuid.UUID `json:"fixture_id"`
}

func (ArgsRegressionSnapshot) Kind() string { return KindRegressionSnapshot }

func (ArgsRegressionSnapshot) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverqueue.QueueLogParsing,
		Priority:    riverqueue.PriorityLow,
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

type WorkerRegressionSnapshot struct {
	parent *Chronicle
	river.WorkerDefaults[ArgsRegressionSnapshot]
}

func (c *Chronicle) NewWorkerRegressionSnapshot() river.Worker[ArgsRegressionSnapshot] {
	return &WorkerRegressionSnapshot{parent: c}
}

func (c *Chronicle) EnqueueRegressionSnapshot(ctx context.Context, fixtureID uuid.UUID) (*rivertype.JobInsertResult, error) {
	return c.queue.Insert(ctx, ArgsRegressionSnapshot{
		FixtureID: fixtureID,
	}, nil)
}

func (w *WorkerRegressionSnapshot) Work(ctx context.Context, job *river.Job[ArgsRegressionSnapshot]) error {
	db := w.parent.Zed
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)

	// 1. Load fixture
	fixture, err := db.GetRegressionFixture(ctx, job.Args.FixtureID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return river.JobCancel(fmt.Errorf("fixture %s not found", job.Args.FixtureID))
		}
		return fmt.Errorf("get regression fixture: %w", err)
	}

	// 2. Get log group and files
	logGroup, err := db.GetWoWLogGroupByID(ctx, fixture.LogGroupID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return river.JobCancel(fmt.Errorf("log group %s not found", fixture.LogGroupID))
		}
		return fmt.Errorf("get log group: %w", err)
	}

	files, err := db.GetWoWLogFilesByGroupID(ctx, fixture.LogGroupID)
	if errors.Is(err, sql.ErrNoRows) || len(files) == 0 {
		return river.JobCancel(errors.New("no log files found for log group, cannot run regression"))
	}
	if err != nil {
		return fmt.Errorf("get log files: %w", err)
	}

	// Regression snapshots run through the v2 parser, which handles the
	// 1.12a ChronicleCompanion addon format (log types v2 and kronos).
	// Broadening to other formats requires sharing the full parser dispatch
	// from logparse.go — tracked as future work.
	if logGroup.WoWLogGroup.LogType.Format() != database.LogFormat112aCcAddon {
		return river.JobCancel(fmt.Errorf("regression snapshots support the 1.12a-cc-addon format (v2/kronos), got log type %s (format %s)", logGroup.WoWLogGroup.LogType, logGroup.WoWLogGroup.LogType.Format()))
	}

	if len(files) != 1 {
		return river.JobCancel(fmt.Errorf("1.12a-cc-addon log group expects 1 file, has %d", len(files)))
	}

	if files[0].StorageDeletedAt.Valid {
		return river.JobCancel(fmt.Errorf("log file %s is marked deleted, cannot run regression", files[0].ID))
	}

	// 3. Parse the combat log
	encountersState := encounters.New(ctx, logger, registry.RegistryForFlavor(logger, database.FlavorFromStrings(logGroup.WoWLogGroup.Flavor)))
	c := consumers.New(logger, encountersState)

	var consumeErr error
	{
		rdr, err := w.loadFile(ctx, files[0])
		if err != nil {
			return fmt.Errorf("load log file: %w", err)
		}

		p, err := parserv2.New(ctx, logger, rdr, w.parent.WoWDB, w.parent.ItemFetcher)
		if err != nil {
			return fmt.Errorf("create v2 parser: %w", err)
		}

		consumeErr = c.ConsumeAll(ctx, p)
	}

	if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
		return fmt.Errorf("consume log: %w", consumeErr)
	}

	// 4. Finalize instances and build snapshot
	var finalized []*instances.FinalizedInstance
	var instanceNames []string

	for _, inst := range encountersState.Instances {
		fin, err := inst.Finalize(ctx)
		if err != nil {
			logger.Warn("finalize instance failed", "instance", inst.Name(), "error", err)
			continue
		}
		if fin == nil || len(fin.Encounters) == 0 {
			continue
		}
		finalized = append(finalized, fin)
		instanceNames = append(instanceNames, inst.Name())
	}

	encountersState.Finalize()

	jsonBytes, err := regression.BuildSnapshotJSON(finalized, instanceNames)
	if err != nil {
		return fmt.Errorf("build snapshot JSON: %w", err)
	}

	// 5. Compare with previous snapshot
	var matchesPrevious pgtype.Bool
	var previousSnapshotID uuid.NullUUID

	prev, err := db.GetLatestRegressionSnapshot(ctx, job.Args.FixtureID)
	if err == nil {
		previousSnapshotID = uuid.NullUUID{UUID: prev.ID, Valid: true}
		// Unmarshal both and compare structurally â JSONB may reorder keys
		var prevVal, newVal interface{}
		if err := json.Unmarshal(prev.Snapshot, &prevVal); err == nil {
			if err := json.Unmarshal(jsonBytes, &newVal); err == nil {
				matches := reflect.DeepEqual(prevVal, newVal)
				matchesPrevious = pgtype.Bool{Bool: matches, Valid: true}
			}
		}
	}
	// If no previous snapshot exists (sql.ErrNoRows), leave both as null

	// 6. Insert snapshot
	_, err = db.InsertRegressionSnapshot(ctx, database.InsertRegressionSnapshotParams{
		FixtureID:          job.Args.FixtureID,
		Version:            version.ExactParserVersion(),
		BuildTime:          version.BuildTime,
		Snapshot:           jsonBytes,
		MatchesPrevious:    matchesPrevious,
		PreviousSnapshotID: previousSnapshotID,
	})
	if err != nil {
		return fmt.Errorf("insert regression snapshot: %w", err)
	}

	return nil
}

// loadFile downloads and decompresses a log file from storage.
// Duplicated from WorkerLogParse to avoid coupling.
func (w *WorkerRegressionSnapshot) loadFile(ctx context.Context, file database.LogFile) (io.Reader, error) {
	storage := w.parent.Storage

	fd, err := storage.DownloadFile(ctx, BucketRaidLogs, w.parent.logPath(file.ID))
	if err != nil {
		return nil, fmt.Errorf("download log file %s: %w", file.ID, err)
	}

	var reader io.Reader = bytes.NewReader(fd)
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
