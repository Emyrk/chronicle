package azerothcore

import (
	"context"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	nextacore "github.com/Emyrk/chronicle/combatlog/parsernext/azerothcore"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// Parser wraps the WotLK parser and handles Chronicle-specific extension
// events (CHRONICLE_UNIT_INFO, etc.) that the base WotLK parser skips as
// UnparsedLine. This gives a clean extension point for AzerothCore logs.
type Parser struct {
	inner      *wotlk.Parser
	logger     *slog.Logger
	gear       gamedb.GearResolver
	wowDB      gamedb.GameDB
	extensions *nextacore.Extensions
}

// New creates an AzerothCore parser that wraps a WotLK parser with unix
// millisecond timestamps enabled and CHRONICLE_* event handling.
func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver) (*Parser, error) {
	inner, err := wotlk.NewLegacy(ctx, logger, r, wowDB, gear, nil)
	if err != nil {
		return nil, err
	}

	p := &Parser{inner: inner, logger: logger, gear: gear, wowDB: wowDB}
	var resolveGear func([]combatant.GearItem)
	if gear != nil {
		resolveGear = gear.ResolveGear
	}
	p.extensions = nextacore.NewExtensions(logger, p.lookupSpell, resolveGear)

	inner.WithEventHook("CHRONICLE_HEADER", p.parseHeader)
	inner.WithEventHook("CHRONICLE_ZONE_INFO", p.parseZoneInfo)
	inner.WithEventHook("CHRONICLE_COMBATANT_INFO", p.parseCombatantInfo)
	inner.WithEventHook("CHRONICLE_UNIT_INFO", p.parseUnitInfo)
	inner.WithEventHook("CHRONICLE_UNIT_EVADE", p.parseUnitEvade)
	inner.WithEventHook("CHRONICLE_UNIT_COMBAT", p.parseUnitCombat)
	inner.WithEventHook("CHRONICLE_ENCOUNTER_START", p.parseEncounterNoop)
	inner.WithEventHook("CHRONICLE_ENCOUNTER_END", p.parseEncounterNoop)
	inner.WithEventHook("CHRONICLE_ENCOUNTER_CREDIT", p.parseEncounterCredit)
	inner.WithEventHook("CHRONICLE_SPELL_TARGET_RESULT", p.parseChronicleNoop)
	inner.WithEventHook("CHRONICLE_LOOT_ITEM", p.parseChronicleNoop)
	inner.WithEventHook("CHRONICLE_LOOT_MONEY", p.parseChronicleNoop)
	inner.WithEventHook("SPELL_INTERRUPT", p.parseSpellInterrupt)
	inner.WithEventHook("SPELL_ABSORBED", p.parseSpellAbsorbed)
	inner.WithEventHook("CHRONICLE_UNIT_DESPAWN", p.parseUnitDespawn)

	// Replace the WoTLK synthetics with our own.
	// A lot of the context comes from the logs now.
	inner.SetSynthetics(synthetic.New(ctx, logger, wowDB))
	inner.SetUnixMillisMode(true)
	return p, nil
}

// Advance reads the next line, delegates to the inner WotLK parser, then
// post-processes to convert any CHRONICLE_* UnparsedLine into typed messages.
func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	msgs, err := p.inner.Advance(ctx)
	if err != nil {
		return nil, err
	}
	return msgs, nil
}

// DetailedTimes delegates to the inner parser for timing metrics.
func (p *Parser) DetailedTimes() map[string]time.Duration {
	return p.inner.DetailedTimes()
}

func (p *Parser) Metrics() parservanilla.Metrics {
	return p.inner.Metrics()
}

// lookupSpell fetches a spell from the game database by ID.
// Returns nil if the ID is zero or the spell is not found.
func (p *Parser) lookupSpell(id chrondbc.SpellID) *chrondbc.Spell {
	if id == 0 {
		return nil
	}
	s, err := p.wowDB.Spell(context.Background(), id)
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			return ptr.Ref(chrondbc.UnknownSpell(id))
		}
		return nil
	}
	return s
}

func (p *Parser) parseHeader(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_HEADER", m, raw)
	return msgs, err
}

func (p *Parser) parseZoneInfo(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_ZONE_INFO", m, raw)
	return msgs, err
}

func (p *Parser) parseCombatantInfo(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_COMBATANT_INFO", m, raw)
	return msgs, err
}

func (p *Parser) parseUnitInfo(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_UNIT_INFO", m, raw)
	return msgs, err
}

func (p *Parser) parseUnitEvade(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_UNIT_EVADE", m, raw)
	return msgs, err
}

func (p *Parser) parseUnitCombat(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_UNIT_COMBAT", m, raw)
	return msgs, err
}

func (p *Parser) parseEncounterNoop(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_ENCOUNTER_START", m, raw)
	return msgs, err
}

func (p *Parser) parseEncounterCredit(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_ENCOUNTER_CREDIT", m, raw)
	return msgs, err
}

func (p *Parser) parseChronicleNoop(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_SPELL_TARGET_RESULT", m, raw)
	return msgs, err
}

func (p *Parser) parseSpellInterrupt(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "SPELL_INTERRUPT", m, raw)
	return msgs, err
}

func (p *Parser) parseSpellAbsorbed(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "SPELL_ABSORBED", m, raw)
	return msgs, err
}

func (p *Parser) parseUnitDespawn(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	msgs, _, err := p.extensions.DecodeEvent(ts, "CHRONICLE_UNIT_DESPAWN", m, raw)
	return msgs, err
}
