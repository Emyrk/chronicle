// Package cleusource composes native TBC/Wrath CLEU lexical and semantic
// decoding into an opt-in message source. It owns file scanning, clock and
// ordering state, companion frames, and diagnostics, but no synthetics or
// consumers.
package cleusource

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// DecoderFactory binds an expansion-owned context validator to the shared CLEU
// semantic decoder.
type DecoderFactory func(cleu.Context, cleu.Hooks) (*cleu.Decoder, error)

type SpellFetcher = gamedb.SpellFetcher

type MissedSpell struct {
	Count int
	Name  string
}

// Pipeline retains semantic source state across consecutive complete files.
// Use one serial Source at a time.
type Pipeline struct {
	logger        *slog.Logger
	spells        gamedb.SpellFetcher
	format        database.LogFormat
	flavor        database.WoWFlavor
	decoder       *cleu.Decoder
	companion     *companion.Parser
	guidNames     map[guid.GUID]string
	missed        map[chrondbc.SpellID]MissedSpell
	baseYear      int
	realmClock    *realmclock.Info
	lastDate      time.Time
	maxRegression time.Duration
	excluded      map[string]struct{}
	boundary      bool
	activeSource  *Source
	lineDuration  time.Duration
	decodeContext context.Context
}

// New requires resolved parse metadata. It never derives Format from Flavor,
// Flavor from Format, or either value from the wire.
func New(ctx context.Context, logger *slog.Logger, db gamedb.SpellFetcher, factory DecoderFactory) (*Pipeline, error) {
	if db == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	if factory == nil {
		return nil, fmt.Errorf("decoder factory cannot be nil")
	}
	resolved, ok := parsectx.FromContext(ctx)
	if !ok || resolved.Format == "" || len(resolved.Flavor) == 0 {
		return nil, fmt.Errorf("complete parsectx format and flavor required")
	}
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	pipeline := &Pipeline{
		logger:        logger,
		spells:        db,
		format:        resolved.Format,
		flavor:        append(database.WoWFlavor(nil), resolved.Flavor...),
		guidNames:     make(map[guid.GUID]string),
		missed:        make(map[chrondbc.SpellID]MissedSpell),
		baseYear:      time.Now().Year(),
		maxRegression: time.Second,
		excluded:      make(map[string]struct{}),
		boundary:      true,
	}
	hooks := cleu.Hooks{
		LookupSpell:     pipeline.lookupSpell,
		DecodeCompanion: pipeline.decodeCompanion,
		RecordGUIDName:  pipeline.recordGUIDName,
		WarnUnparsed: func(raw string) {
			pipeline.logger.Warn("Unparsed line", slog.String("line", raw))
		},
	}
	decoder, err := factory(cleu.Context{Format: pipeline.format, Flavor: pipeline.flavor}, hooks)
	if err != nil {
		return nil, err
	}
	pipeline.decoder = decoder
	return pipeline, nil
}

func (p *Pipeline) lookupSpell(id chrondbc.SpellID, names ...string) *chrondbc.Spell {
	if id == 0 {
		return nil
	}
	ctx := p.decodeContext
	if ctx == nil {
		ctx = context.Background()
	}
	spell, err := p.spells.Spell(ctx, id)
	if err == nil {
		return spell
	}
	entry := p.missed[id]
	entry.Count++
	if entry.Name == "" && len(names) > 0 {
		entry.Name = names[0]
	}
	p.missed[id] = entry
	return nil
}

func (p *Pipeline) recordGUIDName(id guid.GUID, name string) {
	if id != 0 && name != "" {
		p.guidNames[id] = name
	}
}

func (p *Pipeline) decodeCompanion(ts time.Time, payload string) ([]messages.Message, bool, error) {
	if !companion.IsCompanionMessage(payload) {
		return nil, false, nil
	}
	if p.companion == nil {
		p.companion = companion.New(p.logger)
	}
	decoded, err := p.companion.Feed(ts, payload)
	if err == nil {
		p.SetRealmClockInfo(p.companion.RealmClockInfo())
	}
	return decoded, true, err
}

func (p *Pipeline) SetBaseYear(year int) { p.baseYear = year }

func (p *Pipeline) SetRealmClockInfo(info *realmclock.Info) {
	if info == nil {
		return
	}
	clock := *info
	p.realmClock = &clock
	p.baseYear = info.LocalTime.Year()
}

func (p *Pipeline) SetMaxTimestampRegression(maximum time.Duration) {
	if maximum < 0 {
		maximum = 0
	}
	p.maxRegression = maximum
}

func (p *Pipeline) ExcludeEventFromTimestampOrdering(event string) { p.excluded[event] = struct{}{} }

func (p *Pipeline) SawRaidGroup() bool { return p.companion != nil && p.companion.SawRaidGroup() }

func (p *Pipeline) MissedSpells() map[chrondbc.SpellID]MissedSpell { return maps.Clone(p.missed) }

func (p *Pipeline) GUIDName(id guid.GUID) (string, bool) {
	name, ok := p.guidNames[id]
	return name, ok
}

func (p *Pipeline) DetailedTimes() map[string]time.Duration {
	return map[string]time.Duration{"parser.line_parse": p.lineDuration}
}

func (p *Pipeline) normalizeTimestamp(ts time.Time) time.Time {
	ts = ts.AddDate(p.baseYear, 0, 0)
	if p.realmClock != nil {
		ts = p.realmClock.Adjust(ts)
	}
	return ts
}

// Source is file-local. EOF preserves Pipeline state for the next complete file.
type Source struct {
	scanner  *bufio.Scanner
	pipeline *Pipeline
}

func (p *Pipeline) OpenFile(reader io.Reader, maxLineBytes int) (*Source, error) {
	if !p.boundary {
		return nil, fmt.Errorf("previous file has not completed successfully")
	}
	if reader == nil {
		return nil, fmt.Errorf("reader cannot be nil")
	}
	if maxLineBytes <= 0 {
		return nil, fmt.Errorf("max line bytes must be positive")
	}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, min(maxLineBytes, 64*1024)), maxLineBytes)
	source := &Source{scanner: scanner, pipeline: p}
	p.boundary = false
	p.activeSource = source
	return source, nil
}

func (s *Source) Advance(ctx context.Context) ([]messages.Message, error) {
	if s.pipeline.activeSource != s {
		return nil, fmt.Errorf("source is no longer the active file")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	started := time.Now()
	defer func() { s.pipeline.lineDuration += time.Since(started) }()
	if !s.scanner.Scan() {
		if err := s.scanner.Err(); err != nil {
			return nil, parseerrors.AsFatalError(err)
		}
		s.pipeline.boundary = true
		return nil, io.EOF
	}
	raw := s.scanner.Text()
	if raw == "" {
		return messages.Unparsed(time.Time{}, raw), nil
	}
	token, payload, err := cleu.SplitHeader(raw)
	if err != nil {
		return nil, err
	}
	timestamp, err := time.Parse("1/2 15:04:05.000", token)
	if err != nil {
		return nil, fmt.Errorf("parsing timestamp %q: %w", token, err)
	}
	event, fields, err := cleu.ParsePayload(payload)
	if err != nil {
		return nil, err
	}
	timestamp = s.pipeline.normalizeTimestamp(timestamp)
	excluded := false
	if _, excluded = s.pipeline.excluded[event]; !excluded && !s.pipeline.lastDate.IsZero() && timestamp.Before(s.pipeline.lastDate.Add(-s.pipeline.maxRegression)) {
		difference := timestamp.Sub(s.pipeline.lastDate)
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards by %s: latest %v, current %v", difference, s.pipeline.lastDate, timestamp))
	}

	// Legacy advances the watermark before dispatch, including malformed events.
	if !excluded && timestamp.After(s.pipeline.lastDate) {
		s.pipeline.lastDate = timestamp
	}
	// Companion dispatch is part of the semantic decoder, after prefix validation.
	cursor := cleu.NewFields(fields)
	s.pipeline.decodeContext = ctx
	decoded, err := s.pipeline.decoder.Decode(timestamp, event, cursor, raw)
	s.pipeline.decodeContext = nil
	if err == nil {
		err = cursor.Error()
	}
	if err != nil {
		return nil, err
	}
	return decoded, nil
}
