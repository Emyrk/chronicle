package modern

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	wotlksynthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	nextmodern "github.com/Emyrk/chronicle/combatlog/parsernext/formats/modern"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
)

func readBaseYear(r io.Reader) (io.Reader, int, error) {
	reader := bufio.NewReader(r)
	var consumed bytes.Buffer
	for {
		line, err := reader.ReadString('\n')
		consumed.WriteString(line)
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			idx := strings.Index(trimmed, "  ")
			if idx < 0 {
				return nil, 0, fmt.Errorf("modern Blizzard CLEU first record has no separator")
			}
			ts, parseErr := parseTimestamp(trimmed[:idx])
			if parseErr != nil {
				return nil, 0, parseErr
			}
			return io.MultiReader(bytes.NewReader(consumed.Bytes()), reader), ts.Year(), nil
		}
		if err != nil {
			if err == io.EOF {
				return nil, 0, fmt.Errorf("modern Blizzard CLEU log is empty")
			}
			return nil, 0, fmt.Errorf("read modern Blizzard CLEU header: %w", err)
		}
	}
}

// ReorderWindow is the maximum timestamp regression tolerated and repaired for
// modern Blizzard combat logs. The client can write encounter boundaries just
// before slightly older killing-blow events.
const ReorderWindow = 3 * time.Second

// Parser adapts modern Blizzard combat-log records to Chronicle's CLEU parser
// while retaining version-specific metadata such as gear and talent summaries.
type Parser struct {
	inner       *wotlk.Parser
	wowDB       gamedb.SpellFetcher
	talentTrees *talents.TalentTreeData
	flavor      database.WoWFlavor
	guids       *guidNormalizer
	owners      map[guid.GUID]guid.GUID
	version     int
}

func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry, format database.LogFormat) (*Parser, error) {
	r, year, err := readBaseYear(r)
	if err != nil {
		return nil, err
	}
	transformer := newTransformReader(r)
	p, err := newParser(ctx, logger, transformer, wowDB, gear, reg)
	if err != nil {
		return nil, err
	}
	p.guids = transformer.guids
	p.inner.SetBaseYear(year)
	switch format {
	case database.LogFormatV22Cleu:
		p.version = 22
		p.inner.SetMaxTimestampRegression(ReorderWindow)
		p.inner.ExcludeEventFromTimestampOrdering("BLIZZARD_COMBAT_LOG_VERSION")
	case database.LogFormatV9Cleu:
		p.version = 9
	}
	return p, nil
}

// NewHermesProxy creates a parser for HermesProxy 1.14.2 combat logs. Their
// event payloads use Blizzard's v9 layout, while timestamps use the legacy
// month/day layout and ChronicleCompanion data is relayed through cast failures.
func NewHermesProxy(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
	transformer := newHermesProxyTransformReader(r)
	p, err := newParser(ctx, logger, transformer, wowDB, gear, reg)
	if err != nil {
		return nil, err
	}
	p.guids = transformer.guids
	p.version = 9
	return p, nil
}

func newParser(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
	inner, err := wotlk.NewLegacy(ctx, logger, r, wowDB, gear, reg)
	if err != nil {
		return nil, err
	}
	inner.ConfigureSynthetics(ctx, reg, wotlksynthetic.Options{
		CreditEarthShield: true,
		GenerateAbsorbs:   false,
		DetectZone:        false,
	})
	_, talentTrees := parsectx.DatasetTalents(ctx)
	flavor, _ := parsectx.Flavor(ctx)
	p := &Parser{
		inner:       inner,
		wowDB:       wowDB,
		talentTrees: talentTrees,
		flavor:      flavor,
		owners:      make(map[guid.GUID]guid.GUID),
	}
	inner.WithEventHook("BLIZZARD_COMBAT_LOG_VERSION", p.combatLogVersion)
	inner.WithEventHook("BLIZZARD_ZONE_CHANGE", p.zoneChange)
	inner.WithEventHook("BLIZZARD_COMBATANT_INFO", p.combatantInfo)
	inner.WithEventHook("BLIZZARD_SPELL_ABSORBED", p.spellAbsorbed)
	inner.WithEventHook("BLIZZARD_UNIT_OWNER", p.unitOwner)
	inner.WithEventHook("BLIZZARD_UNIT_POSITION", p.unitPosition)
	inner.WithEventHook("BLIZZARD_UNIT_RESOURCES", p.unitResources)
	inner.WithEventHook("BLIZZARD_ENCOUNTER_START", p.encounterStart)
	inner.WithEventHook("BLIZZARD_ENCOUNTER_END", p.encounterEnd)
	inner.WithEventHook("BLIZZARD_WORLD_MARKER_PLACED", p.worldMarkerPlaced)
	inner.WithEventHook("BLIZZARD_WORLD_MARKER_REMOVED", p.worldMarkerRemoved)
	return p, nil
}

// GUIDMappings returns a snapshot of the canonical Blizzard GUIDs observed so
// far and their legacy-compatible Chronicle representations. Callers can persist
// this dictionary without changing existing event and aggregation GUID fields.
func (p *Parser) GUIDMappings() []GUIDMapping {
	if p == nil || p.guids == nil {
		return nil
	}
	return p.guids.mappings()
}

func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	return p.inner.Advance(ctx)
}

func (p *Parser) Metrics() vanilla.Metrics {
	return p.inner.Metrics()
}

func (p *Parser) SetRealmClockInfo(info *realmclock.Info) {
	p.inner.SetRealmClockInfo(info)
}

func (p *Parser) SawRaidGroup() bool {
	return p.inner.SawRaidGroup()
}

func (p *Parser) DetailedTimes() map[string]time.Duration {
	return p.inner.DetailedTimes()
}

func (p *Parser) combatLogVersion(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.CombatLogVersion(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) zoneChange(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.ZoneChange(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) unitOwner(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.UnitOwner(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) unitPosition(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.UnitPosition(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) unitResources(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.UnitResources(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) encounterStart(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.EncounterStart(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) encounterEnd(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.EncounterEnd(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) worldMarkerPlaced(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.WorldMarkerPlaced(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) worldMarkerRemoved(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.WorldMarkerRemoved(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}

func (p *Parser) spellAbsorbed(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.SpellAbsorbed(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}
func (p *Parser) combatantInfo(ts time.Time, m *wotlk.Matched, raw string) ([]messages.Message, error) {
	state := p.handlerState()
	result, err := state.CombatantInfo(ts, m, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}

func (p *Parser) parsePullAuras(ts time.Time, target guid.GUID, raw string) ([]*messages.Aura, error) {
	state := p.handlerState()
	result, err := state.ParsePullAuras(ts, target, raw)
	p.version = state.Version
	p.owners = state.Owners
	if state.GUIDs != nil {
		p.guids = &guidNormalizer{state.GUIDs}
	}
	return result, err
}

func parseTalentSummary(raw string) (*combatant.Talents, error) {
	return nextmodern.ParseTalentSummary(raw)
}
func parseGear(raw string) []combatant.GearItem { return nextmodern.ParseGear(raw) }

func stripRealm(name string) string { return nextmodern.StripRealm(name) }

var _ interface {
	Advance(context.Context) ([]messages.Message, error)
} = (*Parser)(nil)

func (p *Parser) handlerState() *nextmodern.HandlerState {
	var guids *nextmodern.GUIDNormalizer
	if p.guids != nil {
		guids = p.guids.GUIDNormalizer
	}
	return &nextmodern.HandlerState{Version: p.version, Spells: p.wowDB, TalentTrees: p.talentTrees, Flavor: p.flavor, GUIDs: guids, Owners: p.owners}
}
