package chronicle

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/sorter"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/unitname"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/google/uuid"
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
}

func (ArgsLogParse) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       QueueLogParsing,
		Priority:    PriorityDefault,
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

func (a ArgsLogParse) Kind() string { return KindLogParse }

type WorkerLogParse struct {
	Parent *Chronicle

	river.WorkerDefaults[ArgsLogParse]
}

func (w *WorkerLogParse) loadAndSortFile(ctx context.Context, fileID uuid.UUID) (io.Reader, *realmclock.Info, error) {
	storage := w.Parent.Storage
	logger := leveledlog.New(w.Parent.logger, slog.LevelInfo)

	fd, err := storage.DownloadFile(BucketRaidLogs, w.Parent.logPath(fileID))
	if err != nil {
		err = fmt.Errorf("download log file %s: %w", fileID, err)
		if errors.Is(err, os.ErrNotExist) {
			err = river.JobCancel(err)
		}
		return nil, nil, err
	}

	fileData := &bytes.Buffer{}
	_, ri, err := sorter.SortLogs(ctx, logger, bytes.NewReader(fd), fileData)
	if err != nil {
		return nil, ri, fmt.Errorf("sort log file %s: %w", fileID, err)
	}

	// Help GC
	//nolint:ineffassign
	fd = nil

	return fileData, ri, nil
}

func (w *WorkerLogParse) Work(ctx context.Context, job *river.Job[ArgsLogParse]) error {
	db := w.Parent.DB

	files, err := db.GetWoWLogFilesByGroupID(ctx, job.Args.LogID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.Parent.logger.Warn("log parse job for non-existent log group", "log_id", job.Args.LogID)

			return nil
		}

		return fmt.Errorf("fetch log group: %w", err)
	}

	if len(files) != 2 {
		return river.JobCancel(fmt.Errorf("log group does not have exactly 2 files, has %d", len(files)))
	}

	var ri *realmclock.Info
	logger := leveledlog.New(w.Parent.logger, slog.LevelInfo)
	rdrs := make([]io.Reader, len(files))
	for i, file := range files {
		var fri *realmclock.Info
		rdrs[i], fri, err = w.loadAndSortFile(ctx, file.ID)
		if err != nil {
			return err
		}
		if ri == nil && fri != nil {
			ri = fri
		}
	}

	m := vanilla.Merger(logger)
	liner, scan, err := m.LineScanner(ctx, ri, rdrs[0], rdrs[1])
	if err != nil {
		return fmt.Errorf("create line scanner: %w", err)
	}

	p := vanilla.NewFromScanner(logger, liner, scan)
	// encounters
	encountersState := encounters.New(logger)

	c := consumers.New(logger, encountersState)
	err = c.ConsumeAll(ctx, p)
	if err != nil {
		err = fmt.Errorf("consume log: %w", err)
		if !errors.Is(err, context.Canceled) {
			err = river.JobCancel(err)
		}
		return err
	}

	jobOut := chroniclesdk.WoWParsedLogJobOutput{
		InstanceFailures: make(map[string]string),
		Instances:        make([]chroniclesdk.WoWSimpleParsedInstance, 0),
	}

	err = db.InsertParsedLogGroup(ctx, job.Args.LogID)
	if err != nil {
		return river.JobCancel(fmt.Errorf("insert parsed log group: %w", err))
	}

	for i, inst := range encountersState.Instances {
		instanceID := uuid.New()
		builder := newInstanceBuilder(encountersState.Units, instanceID)
		finalized, err := inst.Finalize(ctx)
		if err != nil {
			jobOut.InstanceFailures[fmt.Sprintf("%s_%d", inst.Name(), i)] = err.Error()
			continue
		}

		// TODO: Remove this crutch
		var realmID = dbstatic.RealmAmbershire()
		if finalized.Realm != nil {
			foundRealm, ok := dbstatic.RealmByName(finalized.Realm.RealmName)
			if ok {
				realmID = foundRealm
			}
		}

		err = db.InTx(func(tx database.Store) error {
			insertInstanceParams := database.InsertInstanceParams{
				ID:         instanceID,
				RealmID:    realmID,
				LogGroupID: job.Args.LogID,
				Name:       inst.Name(),
				HashedSlug: pgtype.Text{
					String: database.InstanceSlug(job.Args.LogID, inst.Name()),
					Valid:  true,
				},
			}

			// Handling colliding slugs
			_, err := tx.InstanceBySlug(ctx, insertInstanceParams.HashedSlug)
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

			for id := range inst.Seen() {
				builder.seen(id)
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
					Kill:       enc.IsKill,
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
								Slain:      p.Slain,
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
				WoWInstance: db2sdk.WoWInstance(dbinstance),
				Encounters:  sdkEncounters,
			})

			return nil
		}, nil)
		if err != nil {
			return river.JobCancel(fmt.Errorf("insert finalized encounters: %w", err))
		}
	}

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
	inserted  bool
}

func newInstanceBuilder(db *unitdb.Units, instanceID uuid.UUID) *logParseInstanceBuilder {
	return &logParseInstanceBuilder{
		db:         db,
		instanceID: instanceID,
		accounted:  make(map[guid.GUID]struct{}),

		units:   make([]database.InsertInstanceUnitsParams, 0),
		players: make([]database.InsertInstancePlayersParams, 0),
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

	playerRes := tx.InsertInstancePlayers(ctx, w.players)
	if err := playerRes.Close(); err != nil {
		return fmt.Errorf("insert instance players: %w", err)
	}
	return nil
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
			Name:       unitname.ByEntry(entry),
			Entry:      int32(entry),
		})
	}
}

func (c *Chronicle) EnqueueParseLog(ctx context.Context, log database.WoWLogGroup) (*rivertype.JobInsertResult, error) {
	res, err := c.queue.Insert(ctx, ArgsLogParse{
		LogID: log.ID,
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

	return &database.PeriodMoment{
		Timestamp: t.Timestamp.Date(),
		Reason:    t.String(),
	}
}
