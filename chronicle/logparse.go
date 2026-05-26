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
	"os"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore"
	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/sorter"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/jsontransform"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindLogParse = "log-parse"

type OutputLogParse struct {
	InstanceFailures map[string]string
}

type ArgsLogParse struct {
	LogID uuid.UUID `json:"log_group_id"`
	// RealmID is optional
	RealmID      uuid.UUID `json:"realm_id,omitempty"`
	TenantID     uuid.UUID `json:"tenant_id,omitempty"`
	Verbose      bool      `json:"verbose,omitempty"`
	IdentityMode bool      `json:"identity_mode,omitempty"`
}

func (ArgsLogParse) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverqueue.QueueLogParsing,
		Priority:    riverqueue.PriorityDefault,
		MaxAttempts: 2,
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

func (a ArgsLogParse) Kind() string { return KindLogParse }

type WorkerLogParse struct {
	parent *Chronicle

	river.WorkerDefaults[ArgsLogParse]
}

func (c *Chronicle) NewWorkerLogParse() river.Worker[ArgsLogParse] {
	return &WorkerLogParse{
		parent: c,
	}
}

func (w *WorkerLogParse) loadFile(ctx context.Context, file database.LogFile) (io.Reader, error) {
	storage := w.parent.Storage

	fd, err := storage.DownloadFile(ctx, BucketRaidLogs, w.parent.logPath(file.ID))
	if err != nil {
		err = fmt.Errorf("download log file %s: %w", file.ID, err)
		if errors.Is(err, os.ErrNotExist) {
			err = river.JobCancel(err)
		}
		return nil, err
	}

	// Decompress if stored as gzip
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

	// Help GC
	//nolint:ineffassign
	fd = nil

	return reader, nil
}

func (w *WorkerLogParse) loadAndSortFile(ctx context.Context, file database.LogFile) (logfile.Reader, *realmclock.Info, error) {
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)

	rdr, err := w.loadFile(ctx, file)
	if err != nil {
		return nil, nil, err
	}

	fileData := &bytes.Buffer{}
	sum, ri, err := sorter.SortLogs(ctx, logger, rdr, fileData, false)
	if err != nil {
		return nil, ri, fmt.Errorf("sort log file %s: %w", file.ID, err)
	}

	return logfile.New(&sum.IsRaw, fileData), ri, nil
}

func (w *WorkerLogParse) Work(ctx context.Context, job *river.Job[ArgsLogParse]) error {
	logCapabilities := []string{"overheal"}
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)
	jobStart := time.Now()
	metrics := w.parent.metrics
	report := &chroniclesdk.LogParseReport{
		Instances: make([]chroniclesdk.InstanceReport, 0),
	}
	jobOut := chroniclesdk.WoWParsedLogJobOutput{
		InstanceFailures: make(map[string]string),
		Instances:        make([]chroniclesdk.WoWSimpleParsedInstance, 0),
	}

	// Track job completion for metrics (defer only handles Prometheus metrics)
	var jobResult string
	defer func() {
		metrics.jobDuration.Observe(time.Since(jobStart).Seconds())
		if jobResult != "" {
			metrics.jobsTotal.WithLabelValues(jobResult).Inc()
		}
	}()

	db := w.parent.Zed
	ctx = parseoptions.WithVerbose(ctx, job.Args.Verbose)

	// Fetch the log group to determine log type
	logGroup, err := db.GetWoWLogGroupByID(ctx, job.Args.LogID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.parent.logger.Warn("log parse job for non-existent log group", "log_id", job.Args.LogID)
			jobResult = "cancelled"
			return nil
		}
		jobResult = "failure"
		return fmt.Errorf("fetch log group: %w", err)
	}
	ctx = parsectx.WithType(ctx, logGroup.WoWLogGroup.LogType)

	files, err := db.GetWoWLogFilesByGroupID(ctx, job.Args.LogID)
	if err != nil {
		jobResult = "failure"
		return fmt.Errorf("fetch log files: %w", err)
	}

	// Validate file count based on log type
	expectedFiles := 1
	if logGroup.WoWLogGroup.LogType == database.LogTypeV1 {
		expectedFiles = 2
	}
	if len(files) != expectedFiles {
		jobResult = "cancelled"
		return river.JobCancel(fmt.Errorf("log group (type %s) expects %d files, has %d", logGroup.WoWLogGroup.LogType, expectedFiles, len(files)))
	}

	logLogger := w.parent.logger
	if !w.parent.EmitParsingLogs() {
		logLogger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	// encounters — use DB-backed registry if available, otherwise fall back to default.
	var encountersState *encounters.State
	reg := w.parent.Registry()

	if logGroup.WoWLogGroup.LogType == database.LogTypeAzerothcore {
		encountersState = azencounters.New(ctx, logLogger)
	} else {
		encountersState = encounters.New(ctx, logLogger, reg)
	}

	// Parse combat log - branch based on log type
	parseStart := time.Now()
	var creaturesState *creatures.Creatures
	var c *consumers.Consumers
	if job.Args.IdentityMode {
		creaturesState = creatures.New(logLogger)
		c = consumers.New(logLogger, encountersState, creaturesState)
	} else {
		c = consumers.New(logLogger, encountersState)
	}

	var consumeErr error
	switch logGroup.WoWLogGroup.LogType {
	case database.LogTypeV1:
		// Load and sort files
		loadStart := time.Now()
		var ri *realmclock.Info
		rdrs := make([]logfile.Reader, len(files))
		for i, file := range files {
			var fri *realmclock.Info
			rdrs[i], fri, err = w.loadAndSortFile(ctx, file)
			if err != nil {
				jobResult = "failure"
				return err
			}
			if ri == nil && fri != nil {
				ri = fri
			}
		}
		loadDuration := time.Since(loadStart)
		report.LoadFileDuration = chroniclesdk.DurationFrom(loadDuration)
		metrics.loadFileDuration.Observe(loadDuration.Seconds())

		// V1 parser: requires 2 files merged
		m := vanilla.Merger(logger)
		liner, scan, err := m.LineScanner(ctx, ri, rdrs[0], rdrs[1])
		if err != nil {
			jobResult = "failure"
			return fmt.Errorf("create line scanner: %w", err)
		}

		p := vanilla.NewFromScanner(logger, liner, scan, w.parent.WoWDB)
		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume v1 log: %w", consumeErr)
		}

		// Capture parser metrics
		parserMetrics := p.Metrics()
		report.TotalLines = parserMetrics.TotalLinesParsed
		metrics.linesProcessed.Add(float64(parserMetrics.TotalLinesParsed))

	case database.LogTypeV2, database.LogTypeKronos:
		// Load and sort files
		loadStart := time.Now()
		rdr, err := w.loadFile(ctx, files[0])
		if err != nil {
			return fmt.Errorf("load log file: %w", err)
		}
		loadDuration := time.Since(loadStart)
		report.LoadFileDuration = chroniclesdk.DurationFrom(loadDuration)
		metrics.loadFileDuration.Observe(loadDuration.Seconds())

		// V2 parser: single file
		p, err := parserv2.New(logLogger, rdr, w.parent.WoWDB, w.parent.ItemFetcher)
		if err != nil {
			jobResult = "failure"
			return fmt.Errorf("create v2 parser: %w", err)
		}

		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume v2 log: %w", consumeErr)
		}

		// V2 parser doesn't have metrics yet
		// TODO: Add metrics to v2 parser
	case database.LogTypeAzerothcoreClientside, database.LogTypeEpoch:
		logCapabilities = append(logCapabilities, "interrupt")
		// Load single file
		loadStart := time.Now()
		rdr, err := w.loadFile(ctx, files[0])
		if err != nil {
			return fmt.Errorf("load log file: %w", err)
		}
		loadDuration := time.Since(loadStart)
		report.LoadFileDuration = chroniclesdk.DurationFrom(loadDuration)
		metrics.loadFileDuration.Observe(loadDuration.Seconds())

		// AzerothCore client-side (WotLK 3.3.5a) parser: single file
		p, err := wotlk.New(ctx, logLogger, rdr, w.parent.WoWDB, w.parent.ItemFetcher, reg)
		if err != nil {
			jobResult = "failure"
			return fmt.Errorf("create azerothcore-clientside parser: %w", err)
		}

		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume azerothcore-clientside log: %w", consumeErr)
		}

		parserMetrics := p.Metrics()
		report.TotalLines = parserMetrics.TotalLinesParsed
		metrics.linesProcessed.Add(float64(parserMetrics.TotalLinesParsed))

	case database.LogTypeAzerothcore:
		logCapabilities = append(logCapabilities, "interrupt", "absorb", "server-side")
		// Load single file and normalize concatenated server chunks by unix timestamp.
		loadStart := time.Now()
		rdr, err := w.loadFile(ctx, files[0])
		if err != nil {
			return fmt.Errorf("load log file: %w", err)
		}
		loadDuration := time.Since(loadStart)
		report.LoadFileDuration = chroniclesdk.DurationFrom(loadDuration)
		metrics.loadFileDuration.Observe(loadDuration.Seconds())

		p, err := azerothcore.New(ctx, logLogger, rdr, w.parent.WoWDB, w.parent.ItemFetcher)
		if err != nil {
			jobResult = "failure"
			return fmt.Errorf("create azerothcore parser: %w", err)
		}

		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume azerothcore log: %w", consumeErr)
		}

		parserMetrics := p.Metrics()
		report.TotalLines = parserMetrics.TotalLinesParsed
		metrics.linesProcessed.Add(float64(parserMetrics.TotalLinesParsed))

	default:
		jobResult = "failure"
		return fmt.Errorf("unknown log type: %s", logGroup.WoWLogGroup.LogType)
	}

	parseDuration := time.Since(parseStart)
	report.ParseDuration = chroniclesdk.DurationFrom(parseDuration)
	metrics.parseDuration.Observe(parseDuration.Seconds())

	// Capture consumer times
	consumerTimes := c.Times()
	if len(consumerTimes) > 0 {
		report.ConsumerTimes = make(map[string]chroniclesdk.Duration, len(consumerTimes))
		for k, v := range consumerTimes {
			report.ConsumerTimes[k] = chroniclesdk.DurationFrom(v)
		}
	}

	// Capture missed spells from parser
	type missedSpellEntry struct {
		Count int
		Name  string
	}
	type missedSpeller interface {
		MissedSpells() map[chrondbc.SpellID]missedSpellEntry
	}
	if ms, ok := c.Advancer.(missedSpeller); ok {
		missed := ms.MissedSpells()
		if len(missed) > 0 {
			report.MissedSpells = make(map[int32]chroniclesdk.MissedSpell, len(missed))
			for id, entry := range missed {
				report.MissedSpells[int32(id)] = chroniclesdk.MissedSpell{
					Count: entry.Count,
					Name:  entry.Name,
				}
			}
		}
	}

	if consumeErr != nil {
		consumeErr = fmt.Errorf("consume log: %w", consumeErr)
		if !errors.Is(consumeErr, context.Canceled) {
			jobResult = "cancelled"
			consumeErr = river.JobCancel(consumeErr)
		} else {
			jobResult = "failure"
		}
		return consumeErr
	}

	if creaturesState != nil {
		report.Identity = buildIdentityReport(creaturesState)
	}

	err = db.InsertParsedLogGroup(ctx, job.Args.LogID)
	if err != nil {
		jobResult = "cancelled"
		return river.JobCancel(fmt.Errorf("insert parsed log group: %w", err))
	}

	// Track total finalize and DB insert durations
	var totalFinalizeDuration time.Duration
	var totalDBInsertDuration time.Duration

	for i, inst := range encountersState.Instances {
		instanceID := uuid.New()
		builder := newInstanceBuilder(encountersState.Units, instanceID)

		// Time finalization
		finalizeStart := time.Now()
		finalized, err := inst.Finalize(ctx)
		instFinalizeDuration := time.Since(finalizeStart)
		totalFinalizeDuration += instFinalizeDuration

		if finalized == nil || len(finalized.Encounters) == 0 {
			continue
		}

		instReport := chroniclesdk.InstanceReport{
			Name:             inst.Name(),
			FinalizeDuration: chroniclesdk.DurationFrom(instFinalizeDuration),
		}

		if err != nil {
			jobOut.InstanceFailures[fmt.Sprintf("%s_%d", inst.Name(), i)] = err.Error()
			report.Instances = append(report.Instances, instReport)
			continue
		}

		instReport.EncounterCount = len(finalized.Encounters)
		if len(finalized.UnknownUnits) > 0 {
			instReport.UnknownUnits = make(map[uint32]chroniclesdk.UnknownUnit, len(finalized.UnknownUnits))
			for entryID, u := range finalized.UnknownUnits {
				instReport.UnknownUnits[entryID] = chroniclesdk.UnknownUnit{
					Name:  u.Name,
					Count: u.Count,
				}
			}
		}

		// Use bypass context for realm lookups so we can see all realms
		// regardless of tenant RLS. We validate ownership explicitly below.
		bypassCtx := servicetenant.AdminBypass(ctx)

		var realmID uuid.UUID
		var realmName string
		if finalized.Realm != nil {
			realmName = finalized.Realm.RealmName
			realm, err := db.GetWoWServerRealmByName(bypassCtx, realmName)
			if err == nil {
				realmID = realm.ID
			}
		}
		// Fallback: use realm ID from job args (e.g. AzerothCore uploads
		// where REALM_INFO is not present in the combat log).
		if realmID == uuid.Nil && job.Args.RealmID != uuid.Nil {
			realmID = job.Args.RealmID
			// Populate realmName from DB if we only had the ID.
			if realmName == "" {
				if r, err := db.GetWoWServerRealm(bypassCtx, realmID); err == nil {
					realmName = r.Name
				}
			}
		}
		// Final fallback: use the "Unknown" realm so FK constraints are
		// satisfied. If it doesn't exist yet, create it with the well-known
		// UUIDs from dbstatic.
		if realmID == uuid.Nil {
			realmID = dbstatic.RealmUnknown()
			_, err := db.GetWoWServerRealm(bypassCtx, realmID)
			if err != nil {
				_, _ = db.InsertWoWServer(bypassCtx, database.InsertWoWServerParams{
					ID:   dbstatic.ServerUnknown(),
					Name: "Unknown",
				})
				_, _ = db.InsertWoWServerRealm(bypassCtx, database.InsertWoWServerRealmParams{
					ID:       realmID,
					ServerID: dbstatic.ServerUnknown(),
					Name:     "Unknown",
				})
			}
		}

		// Tenant realm validation: skip (don't insert) instances whose
		// realm doesn't belong to the uploading tenant. Record the
		// instance in InstanceFailures so the UI can show what was
		// detected and why it was rejected.
		if job.Args.TenantID != uuid.Nil {
			reject := false
			realmRow, err := db.GetWoWServerRealm(bypassCtx, realmID)
			if err != nil {
				jobOut.InstanceFailures[fmt.Sprintf("%s_%d", inst.Name(), i)] =
					w.realmRejectionMessage(bypassCtx, db, realmName, uuid.Nil, logGroup.WoWLogGroup.LogType, job.Args.LogID)
				reject = true
			} else {
				server, sErr := db.GetWoWServer(bypassCtx, realmRow.ServerID)
				if sErr != nil || !server.TenantID.Valid || server.TenantID.UUID != job.Args.TenantID {
					jobOut.InstanceFailures[fmt.Sprintf("%s_%d", inst.Name(), i)] =
						w.realmRejectionMessage(bypassCtx, db, realmRow.Name, realmRow.ServerID, logGroup.WoWLogGroup.LogType, job.Args.LogID)
					reject = true
				}
			}
			if reject {
				report.Instances = append(report.Instances, instReport)
				continue
			}
		}

		// Time DB insert
		dbInsertStart := time.Now()
		// Only 1 instance should be inserted at a time. This will break if we go
		// multi-worker, but for now it is a simple way for duplicate detection to not
		// have race conditions.
		w.parent.insertParsedInstanceMu.Lock()
		err = db.InTx(ctx, func(tx *authz.AuthzTX) error {
			defer func() {
				// Always unlock at the end of the tx
				w.parent.insertParsedInstanceMu.Unlock()
			}()
			guild, err := finalized.Guilds.Insert(ctx, encountersState.Units, instanceID, realmID, tx)
			if err != nil {
				return fmt.Errorf("insert guild: %w", err)
			}
			var guildID uuid.UUID
			if guild != nil {
				guildID = guild.ID
			}

			if err := finalized.Loot.Insert(ctx, instanceID, realmID, tx); err != nil {
				return fmt.Errorf("insert loot: %w", err)
			}

			// Compute instance time range from encounters
			var instanceStart, instanceEnd pgtype.Timestamptz
			for _, enc := range finalized.Encounters {
				encStart := database.Timestamptz(enc.Combat.Start)
				encEnd := database.Timestamptz(enc.Combat.End)
				if !instanceStart.Valid || encStart.Time.Before(instanceStart.Time) {
					instanceStart = encStart
				}
				if !instanceEnd.Valid || encEnd.Time.After(instanceEnd.Time) {
					instanceEnd = encEnd
				}
			}

			recorderName := ""
			recorderGUID := ""
			if finalized.RecorderGUID != nil {
				recorderGUID = finalized.RecorderGUID.String()
				if u, ok := encountersState.Units.Get(*finalized.RecorderGUID); ok {
					recorderName = u.Name
				}
			}

			insertInstanceParams := database.InsertInstanceParams{
				ID:         instanceID,
				RealmID:    realmID,
				LogGroupID: job.Args.LogID,
				Name:       inst.Name(),
				HashedSlug: pgtype.Text{
					String: database.InstanceSlug(job.Args.LogID, inst.Name()),
					Valid:  true,
				},
				GuildID: uuid.NullUUID{
					UUID:  guildID,
					Valid: guildID != uuid.Nil,
				},
				StartTime:         instanceStart,
				EndTime:           instanceEnd,
				Capabilities:      logCapabilities,
				Versions:          database.VersionsMap(finalized.Versions),
				RecorderName:      recorderName,
				RecorderGuid:      recorderGUID,
				ParserVersion:     version.GitTag + "+" + version.GitCommit,
				DifficultyName:    inst.CurrentZone.DifficultyName,
				MaxPlayers:        int32(inst.CurrentZone.MaxPlayers),
				DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
			}

			// Handling colliding slugs
			_, err = tx.InstanceBySlug(ctx, insertInstanceParams.HashedSlug)
			if err == nil {
				insertInstanceParams.HashedSlug = pgtype.Text{Valid: false}
			}

			dbinstance, err := tx.InsertInstance(ctx, insertInstanceParams)
			if err != nil {
				return fmt.Errorf("insert instance: %w", err)
			}

			// Reattach of shared_views and youtube rows is handled by
			// the reattach_by_slug trigger on log_instances INSERT.

			evts := inst.Events()
			err = evts.Insert(ctx, tx, dbinstance.ID)
			if err != nil {
				return fmt.Errorf("insert events: %w", err)
			}

			for id := range finalized.Participants.Active {
				builder.seen(id)
			}
			for id := range finalized.Guilds.Participant {
				builder.participate(id)
			}

			// Store the encounters into the database
			sdkEncounters := make([]chroniclesdk.WoWEncounter, 0, len(finalized.Encounters))
			for _, enc := range finalized.Encounters {
				if ctx.Err() != nil {
					return ctx.Err()
				}

				dbencounter, err := tx.InsertEncounter(ctx, database.InsertEncounterParams{
					ID:         enc.Combat.EncounterID,
					InstanceID: dbinstance.ID,
					Name:       enc.Name,
					KillType:   database.KillType(enc.KillType),
					Remaining:  enc.Remaining,
					Boss:       enc.Boss,
					StartTime:  database.Timestamptz(enc.Combat.Start),
					EndTime:    database.Timestamptz(enc.Combat.End),
				})
				if err != nil {
					return fmt.Errorf("insert encounter: %w", err)
				}

				for _, hostile := range enc.Combat.Hostiles {
					builder.seen(hostile.ID)
				}

				encounterFights := make([]database.InsertEncounterCharacterFightsParams, 0)
				for hostileID, hostileFight := range enc.Combat.Hostiles {
					identity := inst.IdentifyUnit(hostileID)
					encounterFights = append(encounterFights, database.InsertEncounterCharacterFightsParams{
						ID:          hostileID,
						Boss:        identity.Boss,
						EncounterID: dbencounter.ID,
						Periods: slice.List[period.Period, database.Period](hostileFight.Activity, func(p period.Period) database.Period {
							return database.Period{
								Start:      momentToDatabaseMoment(p.Start),
								End:        momentToDatabaseMoment(p.End),
								LastActive: momentToDatabaseMoment(p.LastActive),
								EndState:   database.EndState(p.EndState),
							}
						}),
					})
				}

				res := tx.InsertEncounterCharacterFights(ctx, encounterFights)
				if err := res.Close(); err != nil {
					return fmt.Errorf("insert encounter character fights: %w", err)
				}

				sdkEncounters = append(sdkEncounters, db2sdk.WoWEncounter(dbencounter))
			}

			err = builder.insert(ctx, tx)
			if err != nil {
				return err
			}

			// Duplicate instance detection: find other instances in the same
			// realm+zone with overlapping time, then check player overlap.
			if instanceStart.Valid {
				if dupErr := detectAndLinkDuplicate(ctx, tx, dbinstance.ID, dbinstance.RealmID, dbinstance.Name, dbinstance.MaxPlayers, dbinstance.DynamicDifficulty, instanceStart, builder.participants); dupErr != nil {
					slog.WarnContext(ctx, "duplicate detection failed", slog.String("err", dupErr.Error()))
				}
			}

			// Persist speedrun result if available.
			if finalized.Rankings != nil && finalized.Rankings.Speedrun != nil {
				sr := finalized.Rankings.Speedrun
				proofJSON, err := json.Marshal(rankings.SpeedrunProofPayload{
					Proof:      sr.Proof,
					LevelRange: sr.LevelRange,
				})
				if err != nil {
					return fmt.Errorf("marshal speedrun proof: %w", err)
				}
				addonVersion := ""
				if finalized.Versions != nil {
					addonVersion = finalized.Versions["chronicle_companion"]
				}
				parserVer := version.GitTag + "+" + version.GitCommit

				// Data source rule: require server-side capability or addon version
				// for a speedrun to be eligible.
				qualified := sr.Qualified
				if !slices.Contains(logCapabilities, "server-side") && addonVersion == "" {
					qualified = false
				}

				err = tx.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
					InstanceID:   dbinstance.ID,
					InstanceName: inst.Name(),
					RealmID:      dbinstance.RealmID,
					GuildID: uuid.NullUUID{
						UUID:  guildID,
						Valid: guildID != uuid.Nil,
					},
					Qualified:        qualified,
					StartTime:        database.Timestamptz(sr.StartTime),
					CompletionTime:   database.Timestamptz(sr.CompletionTime),
					DurationMs:       sr.Duration.Milliseconds(),
					Proof:            proofJSON,
					AddonVersion:     addonVersion,
					ParserVersionNum: semverenc.Encode(parserVer),
					AddonVersionNum:  semverenc.Encode(addonVersion),
				})
				if err != nil {
					return fmt.Errorf("insert speedrun: %w", err)
				}
			}

			// Persist DPS rankings for clean kills (only for instances with ranking rules).
			if finalized.Rankings != nil && finalized.Rankings.DPS != nil && finalized.RankingRules != nil {
				insertDPSRankings(ctx, tx, finalized, dbinstance, inst.Name(), realmName)
			}

			inst := db2sdk.WoWInstanceWithGuild(dbinstance, guild)
			inst.RealmName = realmName
			jobOut.Instances = append(jobOut.Instances, chroniclesdk.WoWSimpleParsedInstance{
				WoWInstance: inst,
				Encounters:  sdkEncounters,
			})

			return nil
		}, &pgx.TxOptions{
			DeferrableMode: pgx.Deferrable,
		})
		instDBDuration := time.Since(dbInsertStart)
		totalDBInsertDuration += instDBDuration
		instReport.DBInsertDuration = chroniclesdk.DurationFrom(instDBDuration)
		report.Instances = append(report.Instances, instReport)

		if err != nil {
			jobResult = "cancelled"
			return river.JobCancel(fmt.Errorf("insert finalized encounters: %w", err))
		}

		metrics.encountersParsed.Add(float64(len(finalized.Encounters)))
	}

	// Record aggregate timing
	report.FinalizeDuration = chroniclesdk.DurationFrom(totalFinalizeDuration)
	report.DBInsertDuration = chroniclesdk.DurationFrom(totalDBInsertDuration)
	metrics.finalizeDuration.Observe(totalFinalizeDuration.Seconds())
	metrics.dbInsertDuration.Observe(totalDBInsertDuration.Seconds())
	metrics.instancesParsed.Add(float64(len(encountersState.Instances)))

	slices.SortFunc(jobOut.Instances, func(a, b chroniclesdk.WoWSimpleParsedInstance) int {
		if len(a.Encounters) == 0 && len(b.Encounters) == 0 {
			return strings.Compare(a.Name, b.Name)
		}
		if len(a.Encounters) == 0 {
			return 1
		}
		if len(b.Encounters) == 0 {
			return -1
		}
		return int(a.Encounters[0].StartTime.Unix() - b.Encounters[0].StartTime.Unix())
	})

	// Set total duration right before recording output (not in defer)
	report.TotalDuration = chroniclesdk.DurationFrom(time.Since(jobStart))

	jobOut.Report = report
	jobOut.Complete = ptr.Ref(time.Now())
	jobResult = "success"
	_ = river.RecordOutput(ctx, jobOut)

	return nil
}

func (w *WorkerLogParse) NextRetry(job *river.Job[ArgsLogParse]) time.Time {
	next := (&river.DefaultClientRetryPolicy{}).NextRetry(job.JobRow)
	return next.Add(time.Second * 60) // Make it a little slower to retry.
}

type logParseInstanceBuilder struct {
	db         *unitdb.Units
	instanceID uuid.UUID

	accounted map[guid.GUID]struct{}
	units     []database.InsertInstanceUnitsParams
	players   []database.InsertInstancePlayersParams

	participantAccounted map[guid.GUID]struct{}
	participants         []database.InsertInstancePlayersParams
	inserted             bool
}

func newInstanceBuilder(db *unitdb.Units, instanceID uuid.UUID) *logParseInstanceBuilder {
	return &logParseInstanceBuilder{
		db:                   db,
		instanceID:           instanceID,
		accounted:            make(map[guid.GUID]struct{}),
		participantAccounted: make(map[guid.GUID]struct{}),

		units: make([]database.InsertInstanceUnitsParams, 0),
		// players can include extra players seen but not active.
		// participants are those who did damage or healing in the zone.
		players:      make([]database.InsertInstancePlayersParams, 0),
		participants: make([]database.InsertInstancePlayersParams, 0),
	}
}

func (w *logParseInstanceBuilder) insert(ctx context.Context, tx database.Store) error {
	if w.inserted {
		return fmt.Errorf("already inserted")
	}
	defer func() {
		w.inserted = true
	}()

	unitsRes := tx.InsertInstanceUnits(ctx, w.units)
	if err := unitsRes.Close(); err != nil {
		return fmt.Errorf("insert instance units: %w", err)
	}

	playerRes := tx.InsertInstancePlayers(ctx, w.participants)
	if err := playerRes.Close(); err != nil {
		return fmt.Errorf("insert instance players: %w", err)
	}
	return nil
}

func (w *logParseInstanceBuilder) participate(ids ...guid.GUID) {
	for _, id := range ids {
		if id == 0x0000000000000000 {
			continue
		}
		if _, ok := w.participantAccounted[id]; ok {
			continue
		}
		unitData, _ := w.db.Get(id)
		playerData, ok := w.db.GetPlayer(id)
		if ok {
			level := unitData.Level
			if playerData.Level != nil && *playerData.Level > 0 {
				level = *playerData.Level
			}

			w.participantAccounted[id] = struct{}{}
			w.participants = append(w.participants, database.InsertInstancePlayersParams{
				InstanceID: w.instanceID,
				UnitGuid:   id,
				Name:       playerData.Name,
				Level:      level,
				Class:      db2sdk.HeroClassToDB(playerData.HeroClass),
				Race:       database.WowPlayableRace(playerData.Race),
			})
			continue
		}
	}
}

func (w *logParseInstanceBuilder) seen(ids ...guid.GUID) {
	for _, id := range ids {
		if id == 0x0000000000000000 {
			// TODO: Where does this bug come from?
			continue
		}
		if _, ok := w.accounted[id]; ok {
			continue
		}
		w.accounted[id] = struct{}{}
		if id.IsPlayer() {
			playerData, ok := w.db.GetPlayer(id)
			if ok {
				w.players = append(w.players, database.InsertInstancePlayersParams{
					InstanceID: w.instanceID,
					UnitGuid:   id,
					Name:       playerData.Name,
					Level:      -1,
					Class:      db2sdk.HeroClassToDB(playerData.HeroClass),
					Race:       database.WowPlayableRace(playerData.Race),
				})
				continue
			}

			unitInfo, ok := w.db.Get(id)
			if ok {
				w.players = append(w.players, database.InsertInstancePlayersParams{
					InstanceID: w.instanceID,
					UnitGuid:   id,
					Name:       unitInfo.Name,
					Level:      -1,
					Class:      database.WowPlayableClassUNKNOWN,
					Race:       database.WowPlayableRaceUnknown,
				})
				continue
			}

			w.players = append(w.players, database.InsertInstancePlayersParams{
				InstanceID: w.instanceID,
				UnitGuid:   id,
				Name:       "Unknown Player",
				Level:      -1,
				Class:      database.WowPlayableClassUNKNOWN,
				Race:       database.WowPlayableRaceUnknown,
			})

			continue
		}

		entry, _ := id.GetEntry()
		unitInfo, ok := w.db.Get(id)
		if ok {
			w.units = append(w.units, database.InsertInstanceUnitsParams{
				InstanceID: w.instanceID,
				UnitGuid:   id,
				Name:       unitInfo.Name,
				Entry:      int32(entry),
				OwnerGuid:  unitInfo.Owner,
			})
			continue
		}

		w.units = append(w.units, database.InsertInstanceUnitsParams{
			InstanceID: w.instanceID,
			UnitGuid:   id,
			Name:       unitname.ByGUID(id),
			Entry:      int32(entry),
		})
	}
}

func buildIdentityReport(cs *creatures.Creatures) *chroniclesdk.IdentityReport {
	rpt := &chroniclesdk.IdentityReport{
		ZonedUnits: make(map[string][]chroniclesdk.IdentityCreature),
		ZoneSpells: make(map[string][]chroniclesdk.IdentitySpell),
		UnitSpells: make(map[uint32][]string),
	}

	for zone, units := range cs.ZonedUnits {
		for entryID, name := range units {
			if _, ok := totems.EntryIsTotem(entryID); ok {
				continue
			}
			if _, ok := warlockdemon.IsWarlockDemonEntry(entryID); ok {
				continue
			}
			count := len(cs.UnitQuantity[entryID])
			rpt.ZonedUnits[zone] = append(rpt.ZonedUnits[zone], chroniclesdk.IdentityCreature{
				EntryID:     entryID,
				Name:        name,
				UniqueCount: count,
			})
		}
	}

	for zone, spells := range cs.ZoneSpells {
		for spellID, count := range spells {
			rpt.ZoneSpells[zone] = append(rpt.ZoneSpells[zone], chroniclesdk.IdentitySpell{
				SpellID: int32(spellID),
				Count:   count,
			})
		}
	}

	for entryID, spells := range cs.UnitSpells {
		names := make([]string, 0, len(spells))
		for name := range spells {
			names = append(names, name)
		}
		rpt.UnitSpells[entryID] = names
	}

	rpt.GoCode = rpt.GenerateGoCode()

	return rpt
}

// realmRejection is JSON-encoded into InstanceFailures values so the frontend
// can render a rich error UI instead of a plain string.
type realmRejection struct {
	Type      string `json:"type"`                 // always "realm_rejection"
	Realm     string `json:"realm,omitempty"`      // detected realm name
	Message   string `json:"message"`              // headline
	UploadURL string `json:"upload_url,omitempty"` // suggested upload domain
	AddonURL  string `json:"addon_url,omitempty"`  // companion addon link
}

// realmRejectionMessage builds a JSON-encoded rejection string for InstanceFailures.
func (w *WorkerLogParse) realmRejectionMessage(ctx context.Context, db *authz.Authz, realmName string, serverID uuid.UUID, logType database.LogType, logGroupID uuid.UUID) string {
	r := realmRejection{
		Type:  "realm_rejection",
		Realm: realmName,
	}

	if realmName == "" || realmName == "Unknown" {
		r.Message = "Realm not found for this server."
	} else {
		r.Message = fmt.Sprintf("Realm %q does not belong to this server.", realmName)
	}

	// Build a suggested URL so the user can parse the same log on the
	// correct site. For known realms we trace back to the owning tenant;
	// for unknown/empty realms we fall back to the primary domain.
	primaryDomain := w.parent.primaryDomain
	logPath := "/logs/" + logGroupID.String()

	if primaryDomain != "" {
		if realmName != "" && realmName != "Unknown" && serverID != uuid.Nil {
			if server, err := db.GetWoWServer(ctx, serverID); err == nil {
				if server.TenantID.Valid {
					if tenant, tErr := db.GetTenantByID(ctx, server.TenantID.UUID); tErr == nil && tenant.Slug.Valid {
						r.UploadURL = tenant.Slug.String + "." + primaryDomain + logPath
					}
				} else {
					r.UploadURL = primaryDomain + logPath
				}
			}
		} else {
			// Unknown realm — suggest the primary domain.
			r.UploadURL = primaryDomain + logPath
		}
	}

	// If this is an AzerothCore log type, the companion addon might be
	// outdated and not sending REALM_INFO correctly.
	if logType == database.LogTypeAzerothcoreClientside || logType == database.LogTypeAzerothcore {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanionWoTLK"
	}

	if logType == database.LogTypeV2 {
		r.AddonURL = "https://github.com/Emyrk/ChronicleCompanion"
	}

	b, _ := json.Marshal(r)
	return string(b)
}

func (c *Chronicle) EnqueueParseLog(ctx context.Context, log database.WoWLogGroup, verbose bool, identityMode bool, realmID uuid.UUID) (*rivertype.JobInsertResult, error) {
	t := servicetenant.TenantIDFromContext(ctx)
	res, err := c.queue.Insert(ctx, ArgsLogParse{
		LogID:        log.ID,
		RealmID:      realmID,
		TenantID:     t,
		Verbose:      verbose,
		IdentityMode: identityMode,
	}, &river.InsertOpts{
		Tags: []string{
			fmt.Sprintf("owner_%s", log.Owner.String()),
		},
	})

	return res, err
}

func momentToDatabaseMoment(t *period.Moment) *database.PeriodMoment {
	if t == nil {
		return nil
	}
	mt := reflect.TypeOf(t.Timestamp)
	// Use jsontransform to simplify nested types (e.g., Spell -> {id, name})
	msgData, _ := jsontransform.MarshalForStorage(t.Timestamp)

	return &database.PeriodMoment{
		Timestamp:   t.Timestamp.Date(),
		Reason:      t.String(),
		MessageType: mt.String(),
		Message:     msgData,
	}
}

// detectAndLinkDuplicate finds existing instances that look like the same raid
// (same realm, zone name, overlapping start time, >50% player overlap) and
// links them via duplicate_group_id.
func detectAndLinkDuplicate(
	ctx context.Context,
	tx database.Store,
	instanceID uuid.UUID,
	realmID uuid.UUID,
	name string,
	maxPlayers int32,
	dynamicDifficulty int32,
	startTime pgtype.Timestamptz,
	players []database.InsertInstancePlayersParams,
) error {
	windowStart := database.Timestamptz(startTime.Time.Add(-30 * time.Minute))
	windowEnd := database.Timestamptz(startTime.Time.Add(30 * time.Minute))

	candidates, err := tx.FindDuplicateInstanceCandidates(ctx, database.FindDuplicateInstanceCandidatesParams{
		RealmID:           realmID,
		Name:              name,
		MaxPlayers:        maxPlayers,
		DynamicDifficulty: dynamicDifficulty,
		WindowStart:       windowStart,
		WindowEnd:         windowEnd,
		ExcludeID:         instanceID,
	})
	if err != nil {
		return fmt.Errorf("find duplicate candidates: %w", err)
	}

	// Build a set of our player GUIDs for fast lookup.
	ourPlayers := make(map[guid.GUID]struct{}, len(players))
	for _, p := range players {
		ourPlayers[p.UnitGuid] = struct{}{}
	}

	// Collect all candidates with sufficient player overlap.
	var matched []database.FindDuplicateInstanceCandidatesRow
	for _, candidate := range candidates {
		candidateGUIDs, err := tx.InstancePlayerGUIDsByInstanceID(ctx, candidate.ID)
		if err != nil {
			continue
		}

		// Count overlapping players.
		overlap := 0
		for _, g := range candidateGUIDs {
			if _, ok := ourPlayers[g]; ok {
				overlap++
			}
		}

		// Require >50% overlap relative to the larger roster.
		maxSize := len(ourPlayers)
		if len(candidateGUIDs) > maxSize {
			maxSize = len(candidateGUIDs)
		}
		if maxSize == 0 || float64(overlap)/float64(maxSize) <= 0.5 {
			continue
		}

		matched = append(matched, candidate)
	}

	if len(matched) == 0 {
		return nil
	}

	// Pick a canonical group ID: prefer the first existing group, otherwise
	// use the first matched candidate's own ID as the anchor.
	groupID := uuid.NullUUID{}
	for _, m := range matched {
		if m.DuplicateGroupID.Valid {
			groupID = m.DuplicateGroupID
			break
		}
	}
	if !groupID.Valid {
		groupID = uuid.NullUUID{UUID: matched[0].ID, Valid: true}
	}

	// Collect all IDs (matched candidates + our own instance). The query
	// also reassigns any instance whose duplicate_group_id matches one of
	// these IDs, merging previously-separate groups in one statement.
	ids := make([]uuid.UUID, 0, len(matched)+1)
	for _, m := range matched {
		ids = append(ids, m.ID)
	}
	ids = append(ids, instanceID)

	if err := tx.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: groupID,
		Ids:              ids,
	}); err != nil {
		return fmt.Errorf("set duplicate group: %w", err)
	}

	return nil
}

// insertDPSRankings persists per-player DPS rankings for each clean-kill encounter.
// Roles are computed statistically from damage done/taken/healing per encounter.
// Players outside the configured level range are excluded.
func insertDPSRankings(
	ctx context.Context,
	tx *authz.AuthzTX,
	finalized *instances.FinalizedInstance,
	dbinstance database.LogInstance,
	instanceName string,
	realmName string,
) {
	// Level range from speedrun rules (if configured).
	var levelRange *rankings.LevelRangeRequirement
	if finalized.RankingRules != nil && finalized.RankingRules.Speedrun != nil {
		levelRange = finalized.RankingRules.Speedrun.LevelRange
	}

	for _, enc := range finalized.Encounters {
		dpsResult, ok := finalized.Rankings.DPS[enc.Combat.EncounterID]
		if !ok {
			continue
		}
		if enc.KillType != instances.KillTypeClean {
			continue
		}
		durationSecs := enc.Combat.End.Sub(enc.Combat.Start).Seconds()
		if durationSecs < 15 {
			continue
		}

		// Enforce level range: ALL players must be within the level cap.
		// If any player violates the range, skip the entire encounter.
		if levelRange != nil {
			levelViolation := false
			for unitGUID, stats := range dpsResult.Units {
				if !stats.IsPlayer {
					continue
				}
				player, ok := finalized.Guilds.Players[unitGUID]
				if !ok {
					continue
				}
				if player.Level != nil {
					lvl := int32(*player.Level)
					if lvl < levelRange.MinLevel || lvl > levelRange.MaxLevel {
						levelViolation = true
						break
					}
				}
			}
			if levelViolation {
				continue // skip entire encounter
			}
		}

		// Sum pet/totem damage into their owner's totals.
		// The DPS tracker records damage under the raw caster GUID (pet or player).
		// We need to attribute pet damage to the owning player.
		ownerDamage := make(map[guid.GUID]int64) // owner GUID → additional damage from pets
		for _, stats := range dpsResult.Units {
			if stats.OwnerGUID != nil && !stats.IsPlayer {
				ownerDamage[*stats.OwnerGUID] += stats.DamageDone
			}
		}

		// Compute statistical roles for this encounter (using player+pet damage).
		playerMetrics := make(map[guid.GUID]wowspec.PlayerMetrics)
		for unitGUID, stats := range dpsResult.Units {
			if !stats.IsPlayer {
				continue
			}
			playerMetrics[unitGUID] = wowspec.PlayerMetrics{
				DamageDone:  stats.DamageDone + ownerDamage[unitGUID],
				DamageTaken: stats.DamageTaken,
				HealingDone: stats.HealingDone,
			}
		}
		roles := wowspec.InferRoles(playerMetrics)

		for unitGUID, stats := range dpsResult.Units {
			if !stats.IsPlayer {
				continue
			}
			player, ok := finalized.Guilds.Players[unitGUID]
			if !ok {
				continue
			}

			className := string(player.HeroClass)
			// Use the per-encounter talent snapshot from the DPS tracker,
			// not the armory tracker's final state, so mid-raid respecs
			// and respec invalidation are correctly captured.
			spec, talentLayout, talentSummary := extractTalentInfoFromSnapshot(className, stats.Talents)

			var talentBuildID uuid.NullUUID
			if talentLayout != "" {
				tbID, err := tx.UpsertTalentBuild(ctx, database.UpsertTalentBuildParams{
					PlayerClass:   className,
					TalentSummary: talentSummary,
					TalentLayout:  talentLayout,
					Spec:          spec,
				})
				if err != nil {
					slog.WarnContext(ctx, "upsert talent build", slog.String("err", err.Error()))
				} else {
					talentBuildID = uuid.NullUUID{UUID: tbID, Valid: true}
				}
			}

			var playerLevel int16
			if player.Level != nil {
				playerLevel = int16(*player.Level)
			}

			totalDamage := stats.DamageDone + ownerDamage[unitGUID]
			dps := float64(totalDamage) / durationSecs
			playerGuildName := findPlayerGuild(finalized.Guilds.Guilds, unitGUID)

			err := tx.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
				EncounterID: uuid.NullUUID{
					UUID:  enc.Combat.EncounterID,
					Valid: true,
				},
				InstanceID:     dbinstance.ID,
				EncounterName:  enc.Name,
				InstanceName:   instanceName,
				PlayerGuid:     unitGUID.String(),
				PlayerName:     player.Name,
				PlayerClass:    className,
				PlayerSpec:     spec,
				PlayerRole:     roles[unitGUID],
				PlayerLevel:    playerLevel,
				TalentBuildID:  talentBuildID,
				DifficultyName: dbinstance.DifficultyName,
				MaxPlayers:     int16(dbinstance.MaxPlayers),
				RealmID:        dbinstance.RealmID,
				RealmName:      realmName,
				GuildID:       uuid.NullUUID{}, // guild_name is sufficient; avoid FK constraint issues
				GuildName:     playerGuildName,
				DamageDone:    totalDamage,
				DurationSecs:  durationSecs,
				Dps:           dps,
				LogHashedSlug: dbinstance.HashedSlug.String,
				KilledAt:      database.Timestamptz(enc.Combat.End),
			})
			if err != nil {
				slog.WarnContext(ctx, "insert dps ranking",
					slog.String("encounter", enc.Name),
					slog.String("player", player.Name),
					slog.String("err", err.Error()),
				)
			}
		}
	}

	// Aggregate trash (non-boss) encounters into per-(player, spec) ranking rows.
	insertTrashRankings(ctx, tx, finalized, dbinstance, instanceName, realmName, levelRange)
}

// trashPlayerKey groups trash damage by player GUID + spec.
// A player who respecs mid-raid gets separate trash rows per spec.
type trashPlayerKey struct {
	GUID guid.GUID
	Spec string
}

// trashPlayerAccum accumulates trash stats for one (player, spec) pair.
type trashPlayerAccum struct {
	DamageDone    int64
	DamageTaken   int64
	HealingDone   int64
	DurationSecs  float64
	Talents       *combatant.Talents
	TalentLayout  string
	TalentSummary []int16
	LastKilledAt  time.Time
}

func insertTrashRankings(
	ctx context.Context,
	tx *authz.AuthzTX,
	finalized *instances.FinalizedInstance,
	dbinstance database.LogInstance,
	instanceName string,
	realmName string,
	levelRange *rankings.LevelRangeRequirement,
) {
	accum := make(map[trashPlayerKey]*trashPlayerAccum)

	for _, enc := range finalized.Encounters {
		if enc.Boss {
			continue // only trash
		}
		if enc.KillType != instances.KillTypeClean {
			continue
		}
		dpsResult, ok := finalized.Rankings.DPS[enc.Combat.EncounterID]
		if !ok {
			continue
		}
		durationSecs := enc.Combat.End.Sub(enc.Combat.Start).Seconds()
		if durationSecs < 5 {
			continue
		}

		// Enforce level range on the encounter.
		if levelRange != nil {
			levelViolation := false
			for unitGUID, stats := range dpsResult.Units {
				if !stats.IsPlayer {
					continue
				}
				player, ok := finalized.Guilds.Players[unitGUID]
				if !ok {
					continue
				}
				if player.Level != nil {
					lvl := int32(*player.Level)
					if lvl < levelRange.MinLevel || lvl > levelRange.MaxLevel {
						levelViolation = true
						break
					}
				}
			}
			if levelViolation {
				continue
			}
		}

		// Sum pet damage into owner for this encounter.
		ownerDamage := make(map[guid.GUID]int64)
		for _, stats := range dpsResult.Units {
			if stats.OwnerGUID != nil && !stats.IsPlayer {
				ownerDamage[*stats.OwnerGUID] += stats.DamageDone
			}
		}

		for unitGUID, stats := range dpsResult.Units {
			if !stats.IsPlayer {
				continue
			}
			className := string(finalized.Guilds.Players[unitGUID].HeroClass)
			spec, talentLayout, talentSummary := extractTalentInfoFromSnapshot(className, stats.Talents)

			key := trashPlayerKey{GUID: unitGUID, Spec: spec}
			a, ok := accum[key]
			if !ok {
				a = &trashPlayerAccum{
					Talents:       stats.Talents,
					TalentLayout:  talentLayout,
					TalentSummary: talentSummary,
				}
				accum[key] = a
			}
			a.DamageDone += stats.DamageDone + ownerDamage[unitGUID]
			a.DamageTaken += stats.DamageTaken
			a.HealingDone += stats.HealingDone
			a.DurationSecs += durationSecs
			if enc.Combat.End.After(a.LastKilledAt) {
				a.LastKilledAt = enc.Combat.End
			}
		}
	}

	if len(accum) == 0 {
		return
	}

	// Compute roles from the aggregated metrics.
	playerMetrics := make(map[trashPlayerKey]wowspec.PlayerMetrics, len(accum))
	for key, a := range accum {
		playerMetrics[key] = wowspec.PlayerMetrics{
			DamageDone:  a.DamageDone,
			DamageTaken: a.DamageTaken,
			HealingDone: a.HealingDone,
		}
	}
	roles := wowspec.InferRoles(playerMetrics)

	for key, a := range accum {
		player, ok := finalized.Guilds.Players[key.GUID]
		if !ok {
			continue
		}
		if a.DurationSecs < 15 {
			continue
		}

		className := string(player.HeroClass)

		var talentBuildID uuid.NullUUID
		if a.TalentLayout != "" {
			tbID, err := tx.UpsertTalentBuild(ctx, database.UpsertTalentBuildParams{
				PlayerClass:   className,
				TalentSummary: a.TalentSummary,
				TalentLayout:  a.TalentLayout,
				Spec:          key.Spec,
			})
			if err != nil {
				slog.WarnContext(ctx, "upsert talent build (trash)", slog.String("err", err.Error()))
			} else {
				talentBuildID = uuid.NullUUID{UUID: tbID, Valid: true}
			}
		}

		var playerLevel int16
		if player.Level != nil {
			playerLevel = int16(*player.Level)
		}

		dps := float64(a.DamageDone) / a.DurationSecs
		playerGuildName := findPlayerGuild(finalized.Guilds.Guilds, key.GUID)

		err := tx.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID:    uuid.NullUUID{}, // NULL for trash
			InstanceID:     dbinstance.ID,
			EncounterName:  "Trash",
			InstanceName:   instanceName,
			PlayerGuid:     key.GUID.String(),
			PlayerName:     player.Name,
			PlayerClass:    className,
			PlayerSpec:     key.Spec,
			PlayerRole:     roles[key],
			PlayerLevel:    playerLevel,
			TalentBuildID:  talentBuildID,
			DifficultyName: dbinstance.DifficultyName,
			MaxPlayers:     int16(dbinstance.MaxPlayers),
			RealmID:        dbinstance.RealmID,
			RealmName:      realmName,
			GuildID:       uuid.NullUUID{}, // guild_name is sufficient; avoid FK constraint issues
			GuildName:     playerGuildName,
			DamageDone:    a.DamageDone,
			DurationSecs:  a.DurationSecs,
			Dps:           dps,
			LogHashedSlug: dbinstance.HashedSlug.String,
			KilledAt:      database.Timestamptz(a.LastKilledAt),
		})
		if err != nil {
			slog.WarnContext(ctx, "insert trash ranking",
				slog.String("player", player.Name),
				slog.String("spec", key.Spec),
				slog.String("err", err.Error()),
			)
		}
	}
}

// extractTalentInfoFromSnapshot returns the inferred spec, talent layout string,
// and talent summary from a per-encounter talent snapshot. Returns "Unknown" spec
// if the snapshot is nil (e.g., talents were invalidated by a respec).
func extractTalentInfoFromSnapshot(className string, talents *combatant.Talents) (spec string, layout string, summary []int16) {
	if talents == nil {
		return "Unknown", "", nil
	}
	spec = wowspec.InferSpec(className, talents.Summary)
	summary = make([]int16, 3)
	for i, v := range talents.Summary {
		summary[i] = int16(v)
	}
	for i, tree := range talents.Trees {
		if i > 0 {
			layout += "}"
		}
		for _, rank := range tree {
			layout += fmt.Sprintf("%d", rank)
		}
	}
	return spec, layout, summary
}

// findPlayerGuild returns the guild name for a player, or "" if not in a guild.
func findPlayerGuild(guilds map[string]map[guid.GUID]struct{}, playerGUID guid.GUID) string {
	for gName, members := range guilds {
		if _, ok := members[playerGUID]; ok {
			return gName
		}
	}
	return ""
}


