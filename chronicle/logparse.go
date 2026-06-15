package chronicle

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"reflect"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/combatlog/parseoptions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/totems"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/data/warlockdemon"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/jsontransform"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/Emyrk/chronicle/internal/semverenc"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/Emyrk/chronicle/internal/wowspec"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindLogParse                 = "log-parse"
	MinimumCombatTimeForRankings = 3
)

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

func (w *WorkerLogParse) Work(ctx context.Context, job *river.Job[ArgsLogParse]) error {
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
	// Resolve the parse metadata, preferring the persisted format/flavor
	// columns and falling back to deriving from the legacy log type (rows
	// predating the columns, or before the flavor backfill ran).
	lg := logGroup.WoWLogGroup
	logFormat := lg.LogType.Format()
	if lg.Format.Valid {
		logFormat = lg.Format.LogFormat
	}
	// Resolve flavor: prefer the persisted column on the log group, then
	// fall back to legacy LogType derivation. After dataset resolution
	// (below), the dataset's default_flavor may override this if the log
	// group didn't have an explicit flavor.
	explicitFlavor := len(lg.Flavor) > 0
	flavor := lg.LogType.Flavor()
	if explicitFlavor {
		flavor = database.FlavorFromStrings(lg.Flavor)
	}

	files, err := db.GetWoWLogFilesByGroupID(ctx, job.Args.LogID)
	if err != nil {
		jobResult = "failure"
		return fmt.Errorf("fetch log files: %w", err)
	}

	// Validate file count based on log format. SuperWoW (1.12a) emits two
	// files; every other format is a single file.
	expectedFiles := 1
	if logFormat == database.LogFormat112aSuperwowAddon {
		expectedFiles = 2
	}
	if len(files) != expectedFiles {
		jobResult = "cancelled"
		return river.JobCancel(fmt.Errorf("log group (type %s) expects %d files, has %d", logGroup.WoWLogGroup.LogType, expectedFiles, len(files)))
	}

	// ── Resolve dataset + flavor ────────────────────────────────────────
	// If the caller already knows the realm (e.g. AzerothCore uploads),
	// skip the pre-scan entirely.
	preRealmID := job.Args.RealmID
	var preloadedFirst []byte
	if preRealmID == uuid.Nil {
		// Load and decompress the first file for the realm pre-scan.
		// The bytes are kept and passed to parseCombatLog to avoid a
		// second download from object storage.
		var scanErr error
		preloadedFirst, scanErr = w.loadFileBytes(ctx, files[0])
		if scanErr != nil {
			jobResult = "failure"
			return fmt.Errorf("load file for realm scan: %w", scanErr)
		}
		realmName := scanRealmName(logFormat, preloadedFirst)
		if realmName == "" {
			jobResult = "cancelled"
			msg := fmt.Sprintf("no realm info found in log (format %s)", logFormat)
			if logFormat == database.LogFormat335aCcAddon {
				msg += "; the ChronicleCompanion addon is required for 3.3.5a client-side logs (https://github.com/Emyrk/ChronicleCompanionWoTLK)"
			}
			return river.JobCancel(fmt.Errorf("%s", msg))
		}
		bypassCtx := servicetenant.AdminBypass(ctx)
		if r, lookupErr := db.GetWoWServerRealmByName(bypassCtx, realmName); lookupErr == nil {
			preRealmID = r.ID
		}

		// Early tenant validation.
		if preRealmID != uuid.Nil && job.Args.TenantID != uuid.Nil {
			preRealm := resolvedRealm{ID: preRealmID, Name: realmName}
			if keep, failureMsg := w.validateRealmTenant(ctx, db, preRealm, job.Args.TenantID, lg.LogType, job.Args.LogID); !keep {
				jobResult = "cancelled"
				return river.JobCancel(fmt.Errorf("realm tenant mismatch: %s", failureMsg))
			}
		}
	}

	resolved := w.parent.resolveForRealm(ctx, preRealmID)
	gameDB := w.parent.WoWDB.ForDataset(resolved.DatasetID)

	// If the log group didn't have an explicit flavor (from the upload
	// request), use the dataset's default_flavor instead.
	if !explicitFlavor && len(resolved.Flavor) > 0 {
		flavor = resolved.Flavor
	}

	ctx = parsectx.With(ctx, parsectx.Context{
		Type:   lg.LogType,
		Format: logFormat,
		Flavor: flavor,
	})

	// ── Parse ────────────────────────────────────────────────────────────
	reg := w.parent.Registry()
	parsed, err := w.parseCombatLog(ctx, logFormat, files, gameDB, reg, job.Args.IdentityMode, preloadedFirst)
	if err != nil {
		jobResult = "failure"
		return err
	}

	logCapabilities := parsed.logCapabilities
	encountersState := parsed.encountersState

	report.LoadFileDuration = chroniclesdk.DurationFrom(parsed.report.loadFileDuration)
	report.ParseDuration = chroniclesdk.DurationFrom(parsed.report.parseDuration)
	report.TotalLines = parsed.report.totalLines
	metrics.loadFileDuration.Observe(parsed.report.loadFileDuration.Seconds())
	metrics.parseDuration.Observe(parsed.report.parseDuration.Seconds())
	metrics.linesProcessed.Add(float64(parsed.report.totalLines))

	if len(parsed.report.consumerTimes) > 0 {
		report.ConsumerTimes = make(map[string]chroniclesdk.Duration, len(parsed.report.consumerTimes))
		for k, v := range parsed.report.consumerTimes {
			report.ConsumerTimes[k] = chroniclesdk.DurationFrom(v)
		}
	}
	report.MissedSpells = parsed.report.missedSpells

	if parsed.creaturesState != nil {
		report.Identity = buildIdentityReport(parsed.creaturesState)
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

		realm := resolveRealm(ctx, db, finalized, job.Args.RealmID)
		realmID := realm.ID
		realmName := realm.Name

		keep, failureMsg := w.validateRealmTenant(ctx, db, realm, job.Args.TenantID, lg.LogType, job.Args.LogID)
		if !keep {
			jobOut.InstanceFailures[fmt.Sprintf("%s_%d", inst.Name(), i)] = failureMsg
			report.Instances = append(report.Instances, instReport)
			continue
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
					addonVersion = finalized.Versions["addon"]
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
				Race:       validRaceOrUnknown(playerData.Race),
			})
			continue
		}
	}
}

// validRaceOrUnknown converts a parsed race to a database enum value,
// falling back to "Unknown" if the race string is empty or invalid.
func validRaceOrUnknown(race types.HeroRaces) database.WowPlayableRace {
	r := database.WowPlayableRace(race)
	if !r.Valid() {
		return database.WowPlayableRaceUnknown
	}
	return r
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
					Race:       validRaceOrUnknown(playerData.Race),
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
	// Build a set of player GUIDs that violate the level range, reusing the
	// speedrun proof which has already checked every engaged player.
	var levelViolators map[guid.GUID]struct{}
	if finalized.Rankings.Speedrun != nil {
		if lr := finalized.Rankings.Speedrun.LevelRange; lr != nil && !lr.Satisfied {
			levelViolators = make(map[guid.GUID]struct{}, len(lr.Violators))
			for _, v := range lr.Violators {
				levelViolators[v.PlayerGUID] = struct{}{}
			}
		}
	}

	for _, enc := range finalized.Encounters {
		dpsResult, ok := finalized.Rankings.DPS[enc.Combat.EncounterID]
		if !ok {
			continue
		}
		if !enc.Boss {
			continue // non-boss encounters go to trash aggregation
		}
		if enc.KillType != encounter.KillTypeClean && enc.KillType != encounter.KillTypePartial {
			continue
		}
		durationSecs := enc.Combat.End.Sub(enc.Combat.Start).Seconds()

		// If any player in this encounter violated the level range (detected
		// by the speedrun proof), skip the entire encounter.
		if levelViolators != nil {
			violation := false
			for unitGUID := range dpsResult.Units {
				if _, bad := levelViolators[unitGUID]; bad {
					violation = true
					break
				}
			}
			if violation {
				continue
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
			var class, spec string
			if player, ok := finalized.Guilds.Players[unitGUID]; ok {
				class = string(player.HeroClass)
			}
			if stats.Talents != nil && class != "" {
				spec = wowspec.InferSpec(class, stats.Talents.Summary)
			}
			playerMetrics[unitGUID] = wowspec.PlayerMetrics{
				DamageDone:  stats.DamageDone + ownerDamage[unitGUID],
				DamageTaken: stats.DamageTaken,
				HealingDone: stats.HealingDone,
				Class:       class,
				Spec:        spec,
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
				GuildID:        uuid.NullUUID{}, // guild_name is sufficient; avoid FK constraint issues
				GuildName:      playerGuildName,
				DamageDone:     totalDamage,
				DurationSecs:   durationSecs,
				Dps:            dps,
				LogHashedSlug:  dbinstance.HashedSlug.String,
				KilledAt:       database.Timestamptz(enc.Combat.End),
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
	insertTrashRankings(ctx, tx, finalized, dbinstance, instanceName, realmName, levelViolators)
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
	levelViolators map[guid.GUID]struct{},
) {
	accum := make(map[trashPlayerKey]*trashPlayerAccum)

	for _, enc := range finalized.Encounters {
		if enc.Boss {
			continue // only trash
		}
		if enc.KillType != encounter.KillTypeClean {
			continue
		}
		dpsResult, ok := finalized.Rankings.DPS[enc.Combat.EncounterID]
		if !ok {
			continue
		}
		durationSecs := enc.Combat.End.Sub(enc.Combat.Start).Seconds()
		if durationSecs < MinimumCombatTimeForRankings {
			continue
		}

		// If any player in this encounter violated the level range, skip it.
		if levelViolators != nil {
			violation := false
			for unitGUID := range dpsResult.Units {
				if _, bad := levelViolators[unitGUID]; bad {
					violation = true
					break
				}
			}
			if violation {
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
		var class string
		if player, ok := finalized.Guilds.Players[key.GUID]; ok {
			class = string(player.HeroClass)
		}
		playerMetrics[key] = wowspec.PlayerMetrics{
			DamageDone:  a.DamageDone,
			DamageTaken: a.DamageTaken,
			HealingDone: a.HealingDone,
			Class:       class,
			Spec:        key.Spec,
		}
	}
	roles := wowspec.InferRoles(playerMetrics)

	for key, a := range accum {
		player, ok := finalized.Guilds.Players[key.GUID]
		if !ok {
			continue
		}
		if a.DurationSecs < MinimumCombatTimeForRankings {
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
			GuildID:        uuid.NullUUID{}, // guild_name is sufficient; avoid FK constraint issues
			GuildName:      playerGuildName,
			DamageDone:     a.DamageDone,
			DurationSecs:   a.DurationSecs,
			Dps:            dps,
			LogHashedSlug:  dbinstance.HashedSlug.String,
			KilledAt:       database.Timestamptz(a.LastKilledAt),
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
