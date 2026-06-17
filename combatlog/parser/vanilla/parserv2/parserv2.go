package parserv2

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

type Parser struct {
	ctx     context.Context
	logger  *slog.Logger
	wowDB   gamedb.GameDB
	scanner *bufio.Scanner

	lastDate    time.Time
	synthetics  *synthetic.Synthetic
	itemFetcher gamedb.GearResolver

	gameVersions *gameversions.GameVersion

	lineParseDur  time.Duration
	syntheticsDur time.Duration

	missedSpells map[chrondbc.SpellID]missedSpellEntry
}

func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver) (*Parser, error) {
	if wowDB == nil {
		return nil, fmt.Errorf("wowDB cannot be nil")
	}
	return &Parser{
		ctx:          ctx,
		logger:       logger,
		wowDB:        wowDB,
		scanner:      bufio.NewScanner(r),
		synthetics:   synthetic.New(ctx, logger, wowDB),
		itemFetcher:  gear,
		missedSpells: make(map[chrondbc.SpellID]missedSpellEntry),
	}, nil
}

func (p *Parser) DetailedTimes() map[string]time.Duration {
	times := map[string]time.Duration{
		"parser.line_parse": p.lineParseDur,
		"parser.synthetics": p.syntheticsDur,
	}
	for k, v := range p.synthetics.DetailedTimes() {
		times[k] = v
	}
	return times
}

func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	p.ctx = ctx
	now := time.Now()
	msgs, err := p.advance(ctx)
	p.lineParseDur += time.Since(now)
	if err != nil {
		return nil, err
	}

	now = time.Now()
	msgs, err = p.synthetics.ProcessMessages(msgs)
	p.syntheticsDur += time.Since(now)
	if err != nil {
		return nil, fmt.Errorf("processing synthetics: %w", err)
	}

	return msgs, nil
}

func (p *Parser) advance(ctx context.Context) (_ []messages.Message, final error) {
	ok := p.scanner.Scan()
	if !ok {
		return nil, io.EOF
	}
	next := p.scanner.Text()
	ts, event, m, err := ParseLine(next)
	if err != nil {
		return nil, err
	}
	defer func() {
		if final == nil && m.Error() != nil {
			final = m.Error()
		}
	}()

	if event == "HEADER" {
		ts = p.lastDate
	}

	if !p.lastDate.IsZero() && ts.Before(p.lastDate.Add(-time.Second)) {
		return nil, parseerrors.AsFatalError(fmt.Errorf("log dates went backwards: last %v, current %v", p.lastDate, ts))
	}
	p.lastDate = ts

	switch event {
	case "HEADER":
		return p.header(ctx, ts, m)
	case "ZONE_INFO":
		return p.zoneInfo(ctx, ts, m)
	case "UNIT_INFO":
		return p.unitInfo(ctx, ts, m)
	case "COMBATANT_TRANSMOG":
		return p.combatantTransmog(ctx, ts, m)
	case "COMBATANT_INFO":
		return p.combatantInfo(ctx, ts, m)
	case "COMBATANT_TALENTS":
		return p.combatantTalents(ctx, ts, m)
	case "SWING":
		return p.swing(ctx, ts, m)
	case "HEAL":
		return p.heal(ctx, ts, m)
	case "DEATH":
		return p.slain(ctx, ts, m)
	case "SPELL_GO":
		return p.spellGo(ctx, ts, m)
	case "SPELL_START":
		return p.spellStart(ctx, ts, m)
	case "SPELL_FAIL":
		return p.spellFail(ctx, ts, m)
	case "SPELL_DMG":
		return p.spell_dmg(ctx, ts, m)
	case "MISS":
		return p.spellMiss(ctx, ts, m)
	case "BUFF_ADD", "BUFF_REM":
		return p.aura(ctx, event, ts, true, m)
	case "DEBUFF_ADD", "DEBUFF_REM":
		return p.aura(ctx, event, ts, false, m)
	case "BUFF_DURATION":
		return p.auraUpdate(ctx, ts, false, m)
	case "DEBUFF_DURATION":
		return p.auraUpdate(ctx, ts, false, m)
	case "ENERGIZE":
		return p.energize(ctx, ts, m)
	case "AURA_CAST":
		return p.auraCast(ctx, ts, m)
	case "ENV_DMG":
		return p.envDmg(ctx, ts, m)
	case "DMG_SHIELD":
		return p.dmgShield(ctx, ts, m)
	case "DISPEL":
		return p.dispel(ctx, ts, m)
	case "LOOT":
		return p.loot(ctx, ts, m)
	case "LOOT_TRADE":
		return p.lootTrade(ctx, ts, m)
	}

	return messages.Unparsed(ts, next), nil
}

func (p *Parser) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	sp, err := p.wowDB.Spell(ctx, id)
	if err != nil {
		entry := p.missedSpells[id]
		entry.Count++
		p.missedSpells[id] = entry

		if chrondbc.IsSpellNotFound(err) {
			return ptr.Ref(chrondbc.UnknownSpell(id)), nil
		}
		return nil, err
	}
	return sp, nil
}

type missedSpellEntry struct {
	Count int
	Name  string
}

// MissedSpells returns spell IDs that were not found in the DBC, with lookup counts and names.
func (p *Parser) MissedSpells() map[chrondbc.SpellID]missedSpellEntry {
	return p.missedSpells
}
