package wotlk

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type clientFormat uint8

const (
	clientFormatWotLK clientFormat = iota
	clientFormatTBC
)

type Parser struct {
	logger       *slog.Logger
	wowDB        gamedb.SpellFetcher
	scanner      *bufio.Scanner
	clientFormat clientFormat

	lastDate   time.Time
	guidNames  *GUIDNames
	synthetics interface {
		ProcessMessages([]messages.Message) ([]messages.Message, error)
	}
	itemFetcher   gamedb.GearResolver
	baseYear      int
	realmClock    *realmclock.Info
	useUnixMillis bool // true for AzerothCore logs (unix millis timestamps)

	lineParseDur  time.Duration
	syntheticsDur time.Duration
	metrics       parservanilla.Metrics

	missedSpells map[chrondbc.SpellID]missedSpellEntry
	//eventHooks allow overriding or extending handling of specific events without needing to replace the entire processer.
	// The processer is for 3.3.5a logs, so it's possible some AzerothCore-specific events may need custom handling.
	eventHook map[string]func(ts time.Time, m *Matched, raw string) ([]messages.Message, error)

	// companion parses ChronicleCompanionWoTLK addon messages smuggled inside
	// SPELL_CAST_FAILED failedType fields. Lazily initialized on first detection.
	companion *companion.Parser
}

func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
	return newParser(ctx, logger, r, wowDB, gear, reg, clientFormatWotLK)
}

// NewTBC creates a parser for native 2.4.3 COMBAT_LOG_EVENT_UNFILTERED
// records. TBC and WotLK share the event-prefix and base-field layout, but
// their damage and healing suffixes differ.
func NewTBC(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
	return newParser(ctx, logger, r, wowDB, gear, reg, clientFormatTBC)
}

func newParser(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry, format clientFormat) (*Parser, error) {
	if wowDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	gn := NewGUIDNames()
	return &Parser{
		eventHook:    map[string]func(ts time.Time, m *Matched, raw string) ([]messages.Message, error){},
		logger:       logger,
		wowDB:        wowDB,
		scanner:      bufio.NewScanner(r),
		clientFormat: format,
		guidNames:    gn,
		synthetics:   synthetic.New(ctx, logger, wowDB, reg, gn),
		itemFetcher:  gear,
		baseYear:     time.Now().Year(),
		metrics: parservanilla.Metrics{
			MatchingTime:   make(map[string]time.Duration),
			UnmatchingTime: make(map[string]time.Duration),
		},
		missedSpells: make(map[chrondbc.SpellID]missedSpellEntry),
	}, nil
}

func (p *Parser) WithEventHook(event string, hook func(ts time.Time, m *Matched, raw string) ([]messages.Message, error)) {
	p.eventHook[event] = hook
}

func (p *Parser) SetSynthetics(s interface {
	ProcessMessages([]messages.Message) ([]messages.Message, error)
}) {
	p.synthetics = s
}

// SetBaseYear overrides the year used for timestamps (WotLK logs omit the year).
func (p *Parser) SetBaseYear(year int) {
	p.baseYear = year
}

// SetRealmClockInfo configures conversion of client-local combat-log timestamps
// to UTC. The embedded local timestamp also supplies the log year, which WotLK
// row timestamps omit.
func (p *Parser) SetRealmClockInfo(info *realmclock.Info) {
	if info == nil {
		return
	}
	clock := *info
	p.realmClock = &clock
	p.baseYear = info.LocalTime.Year()
}

func (p *Parser) normalizeTimestamp(ts time.Time) time.Time {
	ts = ts.AddDate(p.baseYear, 0, 0)
	if p.realmClock != nil {
		ts = p.realmClock.Adjust(ts)
	}
	return ts
}

// SetUnixMillisMode configures the parser to expect unix millisecond timestamps
// instead of the standard WotLK M/DD HH:MM:SS.mmm format. Used for AzerothCore
// server-generated logs.
func (p *Parser) SetUnixMillisMode(enabled bool) {
	p.useUnixMillis = enabled
}

func (p *Parser) DetailedTimes() map[string]time.Duration {
	if ws, ok := p.synthetics.(*synthetic.Synthetic); ok {
		times := map[string]time.Duration{
			"parser.line_parse": p.lineParseDur,
			"parser.synthetics": p.syntheticsDur,
		}
		for k, v := range ws.DetailedTimes() {
			times[k] = v
		}
		return times
	}

	return map[string]time.Duration{}
}

func (p *Parser) Metrics() parservanilla.Metrics {
	return p.metrics
}

func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	now := time.Now()
	msgs, err := p.advance(ctx)
	parseDuration := time.Since(now)
	p.lineParseDur += parseDuration
	p.metrics.TotalParseDuration += parseDuration
	if err != nil {
		return nil, err
	}
	p.metrics.TotalLinesParsed++

	now = time.Now()
	msgs, err = p.synthetics.ProcessMessages(msgs)
	p.syntheticsDur += time.Since(now)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}

	return msgs, nil
}

func (p *Parser) advance(_ context.Context) (_ []messages.Message, final error) {
	ok := p.scanner.Scan()
	if !ok {
		return nil, io.EOF
	}
	next := p.scanner.Text()
	if next == "" {
		return messages.Unparsed(time.Time{}, next), nil
	}

	var ts time.Time
	var event string
	var m *Matched
	var err error

	if p.useUnixMillis {
		ts, event, m, err = ParseLineUnixMillis(next)
	} else {
		ts, event, m, err = ParseLine(next)
	}
	if err != nil {
		return nil, err
	}
	defer func() {
		if final == nil && m.Error() != nil {
			final = m.Error()
		}
	}()

	if !p.useUnixMillis {
		// WotLK timestamps omit the year and use the client's local wall clock.
		ts = p.normalizeTimestamp(ts)
	}

	if !p.lastDate.IsZero() && ts.Before(p.lastDate.Add(-time.Second)) {
		diff := ts.Sub(p.lastDate)
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards by %s: last %v, current %v", diff.String(), p.lastDate, ts))
	}
	p.lastDate = ts

	return p.dispatch(ts, event, m, next)
}

func (p *Parser) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return p.wowDB.Spell(ctx, id)
}

type missedSpellEntry struct {
	Count int
	Name  string
}

// MissedSpells returns spell IDs that were not found in the DBC, with lookup counts and names.
func (p *Parser) MissedSpells() map[chrondbc.SpellID]missedSpellEntry {
	return p.missedSpells
}
