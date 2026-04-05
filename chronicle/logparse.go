package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"database/sql"
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
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/sorter"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/jsontransform"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/slice"
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
	LogID   uuid.UUID `json:"log_group_id"`
	Verbose bool      `json:"verbose,omitempty"`
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
	sum, ri, err := sorter.SortLogs(ctx, logger, rdr, fileData)
	if err != nil {
		return nil, ri, fmt.Errorf("sort log file %s: %w", file.ID, err)
	}

	return logfile.New(&sum.IsRaw, fileData), ri, nil
}

func (w *WorkerLogParse) Work(ctx context.Context, job *river.Job[ArgsLogParse]) error {
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)
	jobStart := time.Now()
	metrics := w.parent.metrics
	report := &chroniclesdk.LogParseReport{
		Instances: make([]chroniclesdk.InstanceReport, 0),
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

	files, err := db.GetWoWLogFilesByGroupID(ctx, job.Args.LogID)
	if err != nil {
		jobResult = "failure"
		return fmt.Errorf("fetch log files: %w", err)
	}

	// Validate file count based on log type
	expectedFiles := 2
	if logGroup.WoWLogGroup.LogType == database.LogTypeV2 {
		expectedFiles = 1
	}
	if len(files) != expectedFiles {
		jobResult = "cancelled"
		return river.JobCancel(fmt.Errorf("log group (type %s) expects %d files, has %d", logGroup.WoWLogGroup.LogType, expectedFiles, len(files)))
	}

	// encounters
	encountersState := encounters.New(ctx, logger)

	// Parse combat log - branch based on log type
	parseStart := time.Now()
	c := consumers.New(logger, encountersState)

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
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume v1 log: %w", consumeErr)
		}

		// Capture parser metrics
		parserMetrics := p.Metrics()
		report.TotalLines = parserMetrics.TotalLinesParsed
		metrics.linesProcessed.Add(float64(parserMetrics.TotalLinesParsed))

	case database.LogTypeV2:
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
		p, err := parserv2.New(logger, rdr, w.parent.WoWDB)
		if err != nil {
			jobResult = "failure"
			return fmt.Errorf("create v2 parser: %w", err)
		}

		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			jobResult = "failure"
			return fmt.Errorf("consume v2 log: %w", consumeErr)
		}

		// V2 parser doesn't have metrics yet
		// TODO: Add metrics to v2 parser

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

	jobOut := chroniclesdk.WoWParsedLogJobOutput{
		InstanceFailures: make(map[string]string),
		Instances:        make([]chroniclesdk.WoWSimpleParsedInstance, 0),
		Report:           report,
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

		if len(finalized.Encounters) == 0 {
			// Skip instances with no encounters
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

		var realmID = dbstatic.RealmUnknown()
		if finalized.Realm != nil {
			foundRealm, ok := dbstatic.RealmByName(finalized.Realm.RealmName)
			if ok {
				realmID = foundRealm
			}
		}

		// Time DB insert
		dbInsertStart := time.Now()
		err = db.InTx(func(tx *authz.AuthzTX) error {
			guild, err := finalized.Guilds.Insert(ctx,encountersState.Units, instanceID, realmID, tx)
			if err != nil {
				return fmt.Errorf("insert guild: %w", err)
			}
			var guildID uuid.UUID
			if guild != nil {
				guildID = guild.ID
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
				StartTime:    instanceStart,
				EndTime:      instanceEnd,
				Capabilities: []string{"overheal"},
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

			jobOut.Instances = append(jobOut.Instances, chroniclesdk.WoWSimpleParsedInstance{
				WoWInstance: db2sdk.WoWInstanceWithGuild(dbinstance, guild),
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
			w.participantAccounted[id] = struct{}{}
			w.participants = append(w.participants, database.InsertInstancePlayersParams{
				InstanceID: w.instanceID,
				UnitGuid:   id,
				Name:       playerData.Name,
				Level:      int32(unitData.Level),
				Class:      database.WowPlayableClass(playerData.HeroClass),
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
					Class:      database.WowPlayableClass(playerData.HeroClass),
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

func (c *Chronicle) EnqueueParseLog(ctx context.Context, log database.WoWLogGroup, verbose bool) (*rivertype.JobInsertResult, error) {
	res, err := c.queue.Insert(ctx, ArgsLogParse{
		LogID:   log.ID,
		Verbose: verbose,
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
