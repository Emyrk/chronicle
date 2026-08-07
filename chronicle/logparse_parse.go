package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore"
	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/logfile"
	"github.com/Emyrk/chronicle/combatlog/parser/sorter"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/parserv2"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/google/uuid"
)

// parseResult holds everything produced by the parse phase that the
// finalization phase needs.
type parseResult struct {
	encountersState *encounters.State
	creaturesState  *creatures.Creatures
	consumers       *consumers.Consumers
	logCapabilities []string
	report          parseTimingReport
}

// parseTimingReport captures timing + metrics from the parse phase.
type parseTimingReport struct {
	loadFileDuration time.Duration
	parseDuration    time.Duration
	totalLines       int64
	consumerTimes    map[string]time.Duration
	missedSpells     map[int32]chroniclesdk.MissedSpell
}

// parseCombatLog loads log files, creates a format-specific parser, and
// consumes all events. It returns the encounter/creature state and timing
// metrics. The caller is responsible for finalization and DB insertion.
//
// preloadedFirst is optional pre-loaded data for files[0] (from the realm
// pre-scan). When non-nil, the first file is read from this buffer instead
// of re-downloading from object storage.
func (w *WorkerLogParse) parseCombatLog(
	ctx context.Context,
	logFormat database.LogFormat,
	files []database.LogFile,
	gameDB gamedb.GameDB,
	reg *registry.Registry,
	identityMode bool,
	preloadedFirst []byte,
	preRealmName string,
) (*parseResult, error) {
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)
	logLogger := w.parent.logger
	if !w.parent.EmitParsingLogs() {
		logLogger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	logCapabilities := []string{"overheal", "absorb"}

	// encounters — use azerothcore-specific state for server-side logs,
	// otherwise use the general registry.
	var encountersState *encounters.State
	if logFormat == database.LogFormatAzerothcoreMod {
		encountersState = azencounters.New(ctx, logLogger)
	} else {
		encountersState = encounters.New(ctx, logLogger, reg)
	}

	durationModifiers, err := gameDB.DurationModifiers(ctx)
	if err != nil {
		return nil, fmt.Errorf("load aura duration modifiers: %w", err)
	}
	encountersState.Auras.SetDurationModifiers(durationModifiers)

	type consumableCatalogFetcher interface {
		Consumables(context.Context) (*chrondbc.ConsumableCatalog, error)
	}
	if fetcher, ok := gameDB.(consumableCatalogFetcher); ok {
		consumableCatalog, err := fetcher.Consumables(ctx)
		if err != nil {
			return nil, fmt.Errorf("load consumable catalog: %w", err)
		}
		encountersState.ConsumeTracker.SetCatalog(consumableCatalog)
	}

	// Seed the realm from the pre-scan so instances created before the
	// parser hits a REALM_INFO message already have realm context.
	if preRealmName != "" {
		encountersState.CurrentRealm = &realm.Info{RealmName: preRealmName}
	}

	var creaturesState *creatures.Creatures
	var c *consumers.Consumers
	if identityMode {
		creaturesState = creatures.New(logLogger)
		c = consumers.New(logLogger, encountersState, creaturesState)
	} else {
		c = consumers.New(logLogger, encountersState)
	}

	// loadFirstFile returns a reader for files[0], using preloaded data if
	// available to avoid re-downloading from object storage.
	loadFirstFile := func() (io.Reader, error) {
		if preloadedFirst != nil {
			return bytes.NewReader(preloadedFirst), nil
		}
		return w.loadFile(ctx, files[0])
	}

	parseStart := time.Now()
	var loadFileDuration time.Duration
	var totalLines int64

	var consumeErr error
	switch logFormat {
	case database.LogFormat112aSuperwowAddon:
		loadStart := time.Now()
		var ri *realmclock.Info
		rdrs := make([]logfile.Reader, len(files))
		for i, file := range files {
			var rdr io.Reader
			var err error
			if i == 0 && preloadedFirst != nil {
				rdr = bytes.NewReader(preloadedFirst)
			} else {
				rdr, err = w.loadFile(ctx, file)
				if err != nil {
					return nil, err
				}
			}
			var fri *realmclock.Info
			rdrs[i], fri, err = w.sortReader(ctx, rdr, file.ID)
			if err != nil {
				return nil, err
			}
			if ri == nil && fri != nil {
				ri = fri
			}
		}
		loadFileDuration = time.Since(loadStart)

		m := vanilla.Merger(logger)
		liner, scan, err := m.LineScanner(ctx, ri, rdrs[0], rdrs[1])
		if err != nil {
			return nil, fmt.Errorf("create line scanner: %w", err)
		}

		p := vanilla.NewFromScanner(ctx, logger, liner, scan, gameDB)
		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			return nil, fmt.Errorf("consume v1 log: %w", consumeErr)
		}
		totalLines = p.Metrics().TotalLinesParsed

	case database.LogFormat112aCcAddon:
		loadStart := time.Now()
		rdr, err := loadFirstFile()
		if err != nil {
			return nil, fmt.Errorf("load log file: %w", err)
		}
		loadFileDuration = time.Since(loadStart)

		p, err := parserv2.New(ctx, logLogger, rdr, gameDB, gameDB)
		if err != nil {
			return nil, fmt.Errorf("create v2 parser: %w", err)
		}
		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			return nil, fmt.Errorf("consume v2 log: %w", consumeErr)
		}

	case database.LogFormat335aCcAddon:
		logCapabilities = append(logCapabilities, "interrupt")
		loadStart := time.Now()
		data := preloadedFirst
		if data == nil {
			rdr, err := w.loadFile(ctx, files[0])
			if err != nil {
				return nil, fmt.Errorf("load log file: %w", err)
			}
			data, err = io.ReadAll(rdr)
			if err != nil {
				return nil, fmt.Errorf("read wotlk log file: %w", err)
			}
		}
		loadFileDuration = time.Since(loadStart)

		p, err := wotlk.New(ctx, logLogger, bytes.NewReader(data), gameDB, gameDB, reg)
		if err != nil {
			return nil, fmt.Errorf("create wotlk parser: %w", err)
		}
		p.SetRealmClockInfo(scanCompanionHeaderClock(data))
		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			return nil, fmt.Errorf("consume wotlk log: %w", consumeErr)
		}
		totalLines = p.Metrics().TotalLinesParsed

	case database.LogFormatAzerothcoreMod:
		logCapabilities = append(logCapabilities, "interrupt", "server-side")
		loadStart := time.Now()
		rdr, err := loadFirstFile()
		if err != nil {
			return nil, fmt.Errorf("load log file: %w", err)
		}
		loadFileDuration = time.Since(loadStart)

		p, err := azerothcore.New(ctx, logLogger, rdr, gameDB, gameDB)
		if err != nil {
			return nil, fmt.Errorf("create azerothcore parser: %w", err)
		}
		c.Advancer = p
		consumeErr = c.ConsumeAll(ctx, p)
		if consumeErr != nil && !errors.Is(consumeErr, io.EOF) {
			return nil, fmt.Errorf("consume azerothcore log: %w", consumeErr)
		}
		totalLines = p.Metrics().TotalLinesParsed

	default:
		return nil, fmt.Errorf("unknown log format %q", logFormat)
	}

	parseDuration := time.Since(parseStart)

	// Collect consumer timing + missed spells.
	timing := parseTimingReport{
		loadFileDuration: loadFileDuration,
		parseDuration:    parseDuration,
		totalLines:       totalLines,
	}

	consumerTimes := c.Times()
	if len(consumerTimes) > 0 {
		timing.consumerTimes = consumerTimes
	}

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
			timing.missedSpells = make(map[int32]chroniclesdk.MissedSpell, len(missed))
			for id, entry := range missed {
				timing.missedSpells[int32(id)] = chroniclesdk.MissedSpell{
					Count: entry.Count,
					Name:  entry.Name,
				}
			}
		}
	}

	if consumeErr != nil {
		return nil, consumeErr
	}

	return &parseResult{
		encountersState: encountersState,
		creaturesState:  creaturesState,
		consumers:       c,
		logCapabilities: logCapabilities,
		report:          timing,
	}, nil
}

// loadFileBytes downloads and decompresses a log file, returning the raw bytes.
// Used by scanRealmName where we need bytes (not io.Reader) and don't want to
// consume the reader that loadFile returns.
func (w *WorkerLogParse) loadFileBytes(ctx context.Context, file database.LogFile) ([]byte, error) {
	rdr, err := w.loadFile(ctx, file)
	if err != nil {
		return nil, err
	}
	buf := &bytes.Buffer{}
	if _, err := io.Copy(buf, rdr); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// sortReader sorts an already-loaded log reader.
func (w *WorkerLogParse) sortReader(ctx context.Context, rdr io.Reader, fileID uuid.UUID) (logfile.Reader, *realmclock.Info, error) {
	logger := leveledlog.New(w.parent.logger, slog.LevelInfo)
	fileData := &bytes.Buffer{}
	sum, ri, err := sorter.SortLogs(ctx, logger, rdr, fileData, false)
	if err != nil {
		return nil, ri, fmt.Errorf("sort log file %s: %w", fileID, err)
	}
	return logfile.New(&sum.IsRaw, fileData), ri, nil
}

// loadFile downloads and decompresses a single log file from object storage.
func (w *WorkerLogParse) loadFile(ctx context.Context, file database.LogFile) (io.Reader, error) {
	storage := w.parent.Storage

	fd, err := storage.DownloadFile(ctx, BucketRaidLogs, w.parent.logPath(file.ID))
	if err != nil {
		err = fmt.Errorf("download log file %s: %w", file.ID, err)
		if errors.Is(err, io.ErrUnexpectedEOF) {
			err = fmt.Errorf("download log file %s (unexpected EOF — file may be truncated): %w", file.ID, err)
		}
		return nil, err
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

	//nolint:ineffassign
	fd = nil

	return reader, nil
}
