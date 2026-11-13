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
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	vanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	synthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
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
type nextPipeline struct {
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
func NewNext(ctx context.Context, logger *slog.Logger, input io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*NextSource, error) {
	_ = gear // Modern combatant gear is decoded from the wire, as in the legacy adapter.
	if _, err := next.NewNormalizer(ctx); err != nil {
		return nil, err
	}
	if wowDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	format, ok := parsectx.Format(ctx)
	if !ok {
		return nil, fmt.Errorf("modern source format is required")
	}
	if logger == nil {
		logger = slog.Default()
	}
	year := time.Now().Year()
	if format == database.LogFormatV9Cleu || format == database.LogFormatV22Cleu {
		var err error
		input, year, err = readBaseYear(input)
		if err != nil {
			return nil, err
		}
	}
	reader, err := common.NewFileReader(input, bufSize)
	if err != nil {
		return nil, err
	}
	names := wotlk.NewGUIDNames()
	cp := companion.New(logger)
	pipeline := &nextPipeline{reader: reader, year: year, format: format, companion: cp}
	decoder, err := next.NewDecoder(ctx, next.DecoderOptions{Spells: wowDB, Hooks: cleu.Hooks{
		LookupSpell: func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell {
			if id == 0 {
				return nil
			}
			spell, _ := wowDB.Spell(context.Background(), id)
			return spell
		},
		RecordGUIDName: names.Record,
		WarnUnparsed:   func(raw string) { logger.Warn("Unparsed line", slog.String("line", raw)) },
		DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
			if !companion.IsCompanionMessage(payload) {
				return nil, false, nil
			}
			batch, err := cp.Feed(ts, payload)
			if info := cp.RealmClockInfo(); err == nil && info != nil {
				pipeline.setRealmClock(info)
			}
			return batch, true, err
		},
	}})
	if err != nil {
		return nil, err
	}
	pipeline.decoder = decoder
	pipeline.synthetics = synthetic.NewWithOptions(ctx, logger, wowDB, reg, names, synthetic.Options{CreditEarthShield: true, GenerateAbsorbs: false, DetectZone: false})
	source := &NextSource{pipeline: pipeline, output: pipeline}
	if format == database.LogFormatV22Cleu {
		// Reordering is file-local by contract. Complete-file sessions must drain
		// this buffer at EOF and create a fresh one for the next file; events must
		// not be reordered across file boundaries, even if timestamps overlap.
		source.output = reorder.New(pipeline, ReorderWindow)
	}
	return source, nil
}

// Match the legacy scanner's default bound rather than silently accepting a new
// record-size policy. Framing errors are fatal, never successful EOF.
const bufSize = 64 * 1024

func (s *NextSource) Advance(ctx context.Context) ([]messages.Message, error) {
	return s.output.Advance(ctx)
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
		return nil, fmt.Errorf("processing synthetics: %w", err)
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
