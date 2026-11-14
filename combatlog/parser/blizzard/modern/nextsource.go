package modern

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	synthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// NextSource is the opt-in independent modern pipeline. Legacy constructors and
// routing remain unchanged. Consumers receive the same message/synthetic model.
type NextSource struct {
	pipeline *nextPipeline
	output   reorder.Advancer
}
type nextPipeline = NextPipeline

// NextPipeline retains semantic owners across serial complete files. Reader,
// normalized pending records and V22 reorder buffers are strictly file-local.
type NextPipeline struct {
	logger                           *slog.Logger
	db                               gamedb.GameDB
	names                            *pipelineNames
	construction                     *snapshot.Compatibility
	activeSource                     *NextSource
	boundary                         bool
	completedFile                    bool
	graphPending                     bool
	reader                           *common.FileReader
	decoder                          *next.Decoder
	pending                          []string
	synthetics                       *synthetic.Synthetic
	companion                        *companion.Parser
	year                             int
	clock                            *realmclock.Info
	latest                           time.Time
	format                           database.LogFormat
	fatal                            error
	parseDuration, syntheticDuration time.Duration
	lines                            int64
}

// NewNext reads mandatory Format/Flavor from parsectx, never from headers.
// It constructs no old parser: companion, names and synthetics are independent
// pipeline components. V22 reorder is included; do not wrap it a second time.
func NewNext(ctx context.Context, logger *slog.Logger, input io.Reader, db gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*NextSource, error) {
	p, e := NewNextPipeline(ctx, logger, db, gear, reg)
	if e != nil {
		return nil, e
	}
	return p.OpenFile(input)
}
func NewNextPipeline(ctx context.Context, logger *slog.Logger, db gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*NextPipeline, error) {
	_ = gear
	identity, e := modernConstructionIdentity(ctx)
	if e != nil {
		return nil, e
	}
	if _, e := next.NewNormalizer(ctx); e != nil {
		return nil, e
	}
	if db == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if logger == nil {
		logger = slog.Default()
	}
	format, _ := parsectx.Format(ctx)
	p := &NextPipeline{logger: logger, db: db, names: &pipelineNames{values: map[guid.GUID]string{}}, companion: companion.New(logger), year: time.Now().Year(), format: format, boundary: true, construction: identity}
	decoder, e := next.NewDecoder(ctx, p.decoderOptions())
	if e != nil {
		return nil, e
	}
	p.decoder = decoder
	p.synthetics = synthetic.NewWithOptions(ctx, logger, db, reg, p.names, modernSyntheticOptions())
	return p, nil
}
func modernSyntheticOptions() synthetic.Options {
	return synthetic.Options{CreditEarthShield: true, GenerateAbsorbs: false, DetectZone: false}
}
func (p *NextPipeline) decoderOptions() next.DecoderOptions {
	return next.DecoderOptions{Spells: p.db, Hooks: cleu.Hooks{
		LookupSpell: func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell {
			if id == 0 {
				return nil
			}
			spell, _ := p.db.Spell(context.Background(), id)
			return spell
		},
		RecordGUIDName: p.names.Record,
		WarnUnparsed:   func(raw string) { p.logger.Warn("Unparsed line", slog.String("line", raw)) },
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			if !companion.IsCompanionMessage(payload) {
				return nil, false, nil
			}
			batch, e := p.companion.Feed(ts, payload)
			if info := p.companion.RealmClockInfo(); e == nil && info != nil {
				p.setRealmClock(info)
			}
			return batch, true, e
		},
	}}
}
func (p *NextPipeline) OpenFile(input io.Reader) (*NextSource, error) {
	if p.graphPending {
		return nil, fmt.Errorf("modern runtime is unwired")
	}
	if p.fatal != nil {
		return nil, fmt.Errorf("modern pipeline failed: %w", p.fatal)
	}
	if !p.boundary {
		return nil, fmt.Errorf("previous file has not completed successfully")
	}
	if input == nil {
		return nil, fmt.Errorf("source is required")
	}
	year := p.year
	if p.format == database.LogFormatV9Cleu || p.format == database.LogFormatV22Cleu {
		var e error
		input, year, e = readBaseYear(input)
		if e != nil {
			return nil, e
		}
	}
	reader, e := common.NewFileReader(input, bufSize)
	if e != nil {
		return nil, e
	}
	p.reader = reader
	p.pending = nil
	p.year = year
	p.boundary = false
	source := &NextSource{pipeline: p, output: p}
	if p.format == database.LogFormatV22Cleu {
		source.output = reorder.New(p, ReorderWindow)
	}
	p.activeSource = source
	return source, nil
}

type pipelineNames struct{ values map[guid.GUID]string }

func (n *pipelineNames) Record(id guid.GUID, name string) {
	if id != 0 && name != "" {
		n.values[id] = name
	}
}
func (n *pipelineNames) Get(id guid.GUID) (string, bool) { name, ok := n.values[id]; return name, ok }

// Match the legacy scanner's default bound rather than silently accepting a new
// record-size policy. Framing errors are fatal, never successful EOF.
const bufSize = 64 * 1024

func (s *NextSource) Advance(ctx context.Context) ([]messages.Message, error) {
	if s.pipeline.activeSource != s {
		return nil, parseerrors.AsFatalError(fmt.Errorf("source is no longer active"))
	}
	if s.pipeline.fatal != nil {
		return nil, s.pipeline.fatal
	}
	if e := ctx.Err(); e != nil {
		return nil, e
	}
	if s.pipeline.boundary {
		return nil, io.EOF
	}
	batch, e := s.output.Advance(ctx)
	if e == io.EOF {
		s.pipeline.boundary = true
		s.pipeline.completedFile = true
		s.pipeline.reader = nil
		s.pipeline.pending = nil
	}
	return batch, e
}
func (s *NextSource) GUIDMappings() []GUIDMapping             { return s.pipeline.decoder.GUIDMappings() }
func (s *NextSource) SawRaidGroup() bool                      { return s.pipeline.companion.SawRaidGroup() }
func (s *NextSource) SetRealmClockInfo(info *realmclock.Info) { s.pipeline.setRealmClock(info) }
func (p *nextPipeline) setRealmClock(info *realmclock.Info) {
	if info != nil {
		copy := *info
		p.clock = &copy
		p.year = info.LocalTime.Year()
	}
}
func (s *NextSource) DetailedTimes() map[string]time.Duration {
	result := s.pipeline.synthetics.DetailedTimes()
	result["parser.line_parse"] = s.pipeline.parseDuration
	result["parser.synthetics"] = s.pipeline.syntheticDuration
	return result
}
func (s *NextSource) Metrics() vanilla.Metrics {
	return vanilla.Metrics{TotalParseDuration: s.pipeline.parseDuration, TotalLinesParsed: s.pipeline.lines}
}
func (p *nextPipeline) Advance(ctx context.Context) ([]messages.Message, error) {
	if p.fatal != nil {
		return nil, p.fatal
	}
	if e := ctx.Err(); e != nil {
		return nil, e
	}
	start := time.Now()
	batch, err := p.decode(ctx)
	p.parseDuration += time.Since(start)
	if err != nil {
		if parseerrors.IsFatalError(err) {
			p.fatal = err
		}
		return nil, err
	}
	p.lines++
	start = time.Now()
	batch, err = p.synthetics.ProcessMessages(batch)
	p.syntheticDuration += time.Since(start)
	if err != nil {
		p.fatal = parseerrors.AsFatalError(fmt.Errorf("processing synthetics: %w", err))
		return nil, p.fatal
	}
	return batch, nil
}
func (p *nextPipeline) decode(ctx context.Context) ([]messages.Message, error) {
	for len(p.pending) == 0 {
		line, err := p.reader.Next(ctx)
		if err == io.EOF {
			return nil, io.EOF
		}
		if err != nil {
			return nil, parseerrors.AsFatalError(err)
		}
		raw := strings.TrimSpace(line.Raw)
		if raw == "" {
			continue
		}
		p.pending, err = p.decoder.NormalizeLine(raw)
		if err != nil {
			return nil, parseerrors.AsFatalError(err)
		}
	}
	raw := p.pending[0]
	p.pending = p.pending[1:]
	token, event, _, err := cleu.ParseLine(raw)
	if err != nil {
		return nil, err
	}
	ts, err := time.Parse("1/2 15:04:05.000", token)
	if err != nil {
		return nil, err
	}
	ts = ts.AddDate(p.year, 0, 0)
	if p.clock != nil {
		ts = p.clock.Adjust(ts)
	}
	excluded := p.format == database.LogFormatV22Cleu && event == "BLIZZARD_COMBAT_LOG_VERSION"
	window := time.Second
	if p.format == database.LogFormatV22Cleu {
		window = ReorderWindow
	}
	if !excluded {
		if !p.latest.IsZero() && ts.Before(p.latest.Add(-window)) {
			return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards by %s: latest %v, current %v", ts.Sub(p.latest).String(), p.latest, ts))
		}
		if ts.After(p.latest) {
			p.latest = ts
		}
	}
	return p.decoder.DecodeNormalized(ts, raw)
}
