package modern

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	wotlksynthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Gophercraft/core/i18n"
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

// Parser adapts modern Blizzard combat-log records to Chronicle's CLEU parser
// while retaining version-specific metadata such as gear and talent summaries.
type Parser struct {
	inner       *wotlk.Parser
	wowDB       gamedb.SpellFetcher
	talentTrees *talents.TalentTreeData
	guids       *guidNormalizer
	version     int
}

func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
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
	inner, err := wotlk.New(ctx, logger, r, wowDB, gear, reg)
	if err != nil {
		return nil, err
	}
	inner.ConfigureSynthetics(ctx, reg, wotlksynthetic.Options{
		CreditEarthShield: true,
		GenerateAbsorbs:   false,
		DetectZone:        false,
	})
	_, talentTrees := parsectx.DatasetTalents(ctx)
	p := &Parser{inner: inner, wowDB: wowDB, talentTrees: talentTrees}
	inner.WithEventHook("BLIZZARD_COMBAT_LOG_VERSION", p.combatLogVersion)
	inner.WithEventHook("BLIZZARD_ZONE_CHANGE", p.zoneChange)
	inner.WithEventHook("BLIZZARD_COMBATANT_INFO", p.combatantInfo)
	inner.WithEventHook("BLIZZARD_SPELL_ABSORBED", p.spellAbsorbed)
	inner.WithEventHook("BLIZZARD_ENCOUNTER_START", p.encounterStart)
	inner.WithEventHook("BLIZZARD_ENCOUNTER_END", p.encounterEnd)
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

func (p *Parser) combatLogVersion(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	versionRaw := m.String()
	values := map[string]string{"combat_log": versionRaw}
	for m.Remain() >= 2 {
		key, value := strings.ToLower(m.String()), m.String()
		values[key] = value
	}
	if err := m.Error(); err != nil {
		return nil, err
	}
	version, err := strconv.Atoi(versionRaw)
	if err != nil {
		return nil, fmt.Errorf("parse Blizzard combat log version %q: %w", versionRaw, err)
	}
	p.version = version
	return []messages.Message{&messages.Versions{
		MessageBase: messages.Base(ts),
		Versions:    values,
	}}, nil
}

func (p *Parser) zoneChange(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	mapID := m.Uint32()
	name := m.String()
	instanceType := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}
	return []messages.Message{&messages.Zone{
		MessageBase: messages.Base(ts),
		Zone: zone.Zone{
			Seen:         ts,
			Name:         strings.ToLower(name),
			MapID:        mapID,
			InstanceID:   mapID,
			InstanceType: instanceType,
			IsInstance:   instanceType != "0",
		},
	}}, nil
}

func (p *Parser) encounterStart(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	encounterID := m.Int32()
	name := m.String()
	difficulty := m.Int32()
	groupSize := m.Int32()
	var instanceID uint32
	if m.Remain() > 0 {
		instanceID = m.Uint32()
	}
	if m.Remain() > 0 {
		_ = m.Int32()
	}
	if err := m.Error(); err != nil {
		return nil, err
	}
	return []messages.Message{&messages.EncounterBoundary{
		MessageBase: messages.Base(ts),
		Active:      true,
		EncounterID: encounterID,
		Name:        name,
		Difficulty:  difficulty,
		GroupSize:   groupSize,
		InstanceID:  instanceID,
	}}, nil
}

func (p *Parser) encounterEnd(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	encounterID := m.Int32()
	name := m.String()
	difficulty := m.Int32()
	groupSize := m.Int32()
	success := m.Int32() == 1
	if err := m.Error(); err != nil {
		return nil, err
	}
	return []messages.Message{&messages.EncounterBoundary{
		MessageBase: messages.Base(ts),
		Active:      false,
		EncounterID: encounterID,
		Name:        name,
		Difficulty:  difficulty,
		GroupSize:   groupSize,
		Success:     &success,
	}}, nil
}

func (p *Parser) spellAbsorbed(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	attacker := m.Guid()
	target := m.Guid()
	damageSpellID := m.Int32()
	caster := m.Guid()
	absorbSpellID := m.Int32()
	absorbSpellName := m.String()
	absorbSchool := m.School()
	amount := m.Int32()
	if err := m.Error(); err != nil {
		return nil, err
	}

	var damageSpell *chrondbc.Spell
	if damageSpellID != 0 {
		damageSpell, _ = p.wowDB.Spell(context.Background(), chrondbc.SpellID(damageSpellID))
	}
	absorbSpell, _ := p.wowDB.Spell(context.Background(), chrondbc.SpellID(absorbSpellID))
	if absorbSpell == nil {
		absorbSpell = &chrondbc.Spell{ID: chrondbc.SpellID(absorbSpellID), Name_lang: i18n.GetEnglish(absorbSpellName)}
	}
	return []messages.Message{&messages.Absorbed{
		MessageBase:  messages.Base(ts),
		Attacker:     attacker,
		Target:       target,
		DamageSpell:  damageSpell,
		Caster:       caster,
		AbsorbSpell:  absorbSpell,
		AbsorbSchool: absorbSchool,
		Amount:       amount,
	}}, nil
}

func (p *Parser) combatantInfo(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	playerGUID := m.Guid()
	name := m.String()
	encoded := m.String()
	if err := m.Error(); err != nil {
		return nil, err
	}
	raw, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode Blizzard COMBATANT_INFO: %w", err)
	}
	fields := splitTopLevel(string(raw))
	if len(fields) < 27 {
		return nil, fmt.Errorf("blizzard COMBATANT_INFO has %d fields, need at least 27", len(fields))
	}

	var talents *combatant.Talents
	heroClass := types.HeroClassesUNKNOWN
	var gear []combatant.GearItem
	switch p.version {
	case 9:
		talents, err = parseTalentSummary(fields[24])
		if err != nil {
			return nil, err
		}
		gear = parseGear(fields[26])
	case 22:
		if len(fields) < 28 {
			return nil, fmt.Errorf("blizzard V22 COMBATANT_INFO has %d fields, need at least 28", len(fields))
		}
		talents, heroClass, err = resolveV22Talents(fields[25], p.talentTrees)
		if err != nil {
			return nil, err
		}
		gear = parseGear(fields[27])
	default:
		return nil, fmt.Errorf("blizzard COMBATANT_INFO has unsupported combat log version %d", p.version)
	}
	return []messages.Message{&messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant: combatant.Combatant{
			Name:       stripRealm(name),
			Guid:       playerGUID,
			Seen:       ts,
			HeroClass:  heroClass,
			Gender:     -1,
			Race:       "Unknown",
			GearSetups: gear,
			Talents:    talents,
		},
	}}, nil
}

type v22TalentSelection struct {
	nodeID      int32
	nodeEntryID int32
	rank        uint8
}

func resolveV22Talents(raw string, treeData *talents.TalentTreeData) (*combatant.Talents, types.HeroClasses, error) {
	selected, err := parseV22TalentSelections(raw)
	if err != nil || len(selected) == 0 || treeData == nil {
		return nil, types.HeroClassesUNKNOWN, err
	}

	var resolved *combatant.Talents
	resolvedClass := types.HeroClassesUNKNOWN
	for classID, classData := range treeData.Classes {
		candidate, ok := resolveV22ClassTalents(selected, classData)
		if !ok {
			continue
		}
		if resolved != nil {
			// Talent node IDs should identify one class. Treat ambiguous dataset
			// data as unavailable rather than attaching the wrong build or class.
			return nil, types.HeroClassesUNKNOWN, nil
		}
		resolved = candidate
		resolvedClass = heroClassFromID(classID)
	}
	return resolved, resolvedClass, nil
}

func heroClassFromID(classID int32) types.HeroClasses {
	switch classID {
	case 1:
		return types.HeroClassesWARRIOR
	case 2:
		return types.HeroClassesPALADIN
	case 3:
		return types.HeroClassesHUNTER
	case 4:
		return types.HeroClassesROGUE
	case 5:
		return types.HeroClassesPRIEST
	case 6:
		return types.HeroClassesDEATHKNIGHT
	case 7:
		return types.HeroClassesSHAMAN
	case 8:
		return types.HeroClassesMAGE
	case 9:
		return types.HeroClassesWARLOCK
	case 11:
		return types.HeroClassesDRUID
	default:
		return types.HeroClassesUNKNOWN
	}
}

func parseV22TalentSelections(raw string) ([]v22TalentSelection, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "[]" || raw == "nil" {
		return nil, nil
	}

	entries := splitTopLevel(strings.Trim(raw, "[]"))
	selected := make([]v22TalentSelection, 0, len(entries))
	for _, entry := range entries {
		parts := splitTopLevel(strings.Trim(entry, "()"))
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid V22 talent selection %q", entry)
		}
		nodeID, err := strconv.ParseInt(parts[0], 10, 32)
		if err != nil {
			return nil, fmt.Errorf("parse V22 talent node ID %q: %w", parts[0], err)
		}
		nodeEntryID, err := strconv.ParseInt(parts[1], 10, 32)
		if err != nil {
			return nil, fmt.Errorf("parse V22 talent node entry ID %q: %w", parts[1], err)
		}
		rank, err := strconv.ParseUint(parts[2], 10, 8)
		if err != nil {
			return nil, fmt.Errorf("parse V22 talent rank %q: %w", parts[2], err)
		}
		selected = append(selected, v22TalentSelection{
			nodeID:      int32(nodeID),
			nodeEntryID: int32(nodeEntryID),
			rank:        uint8(rank),
		})
	}
	return selected, nil
}

func resolveV22ClassTalents(selected []v22TalentSelection, classData talents.ClassTalentData) (*combatant.Talents, bool) {
	type location struct {
		tree  int
		entry talents.TalentEntry
	}
	byNode := make(map[int32]location)
	result := &combatant.Talents{}
	for _, tab := range classData.Tabs {
		tree := int(tab.OrderIndex)
		if tree < 0 || tree >= len(result.Trees) {
			continue
		}
		result.TabNames[tree] = tab.Name
		for _, entry := range tab.Talents {
			if entry.TabIndex < 0 {
				continue
			}
			needed := int(entry.TabIndex) + 1
			if len(result.Trees[tree]) < needed {
				result.Trees[tree] = append(result.Trees[tree], make([]uint8, needed-len(result.Trees[tree]))...)
			}
			byNode[entry.ID] = location{tree: tree, entry: entry}
		}
	}

	for _, selection := range selected {
		loc, ok := byNode[selection.nodeID]
		if !ok || !containsInt32(loc.entry.TraitNodeEntryIDs, selection.nodeEntryID) ||
			selection.rank == 0 || int32(selection.rank) > loc.entry.MaxRank {
			return nil, false
		}
		index := int(loc.entry.TabIndex)
		previous := result.Trees[loc.tree][index]
		result.Trees[loc.tree][index] = selection.rank
		result.Summary[loc.tree] -= previous
		result.Summary[loc.tree] += selection.rank
	}
	return result, true
}

func containsInt32(values []int32, want int32) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func parseTalentSummary(raw string) (*combatant.Talents, error) {
	parts := splitTopLevel(strings.Trim(raw, "()"))
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid v9 talent summary %q", raw)
	}
	result := &combatant.Talents{}
	for i, part := range parts {
		value, err := strconv.ParseUint(part, 10, 8)
		if err != nil {
			return nil, fmt.Errorf("parse v9 talent summary %q: %w", raw, err)
		}
		result.Summary[i] = uint8(value)
	}
	return result, nil
}

func parseGear(raw string) []combatant.GearItem {
	entries := splitTopLevel(strings.Trim(raw, "[]"))
	if len(entries) == 1 && entries[0] == "" {
		return nil
	}
	gear := make([]combatant.GearItem, 0, len(entries))
	for _, entry := range entries {
		parts := splitTopLevel(strings.Trim(entry, "()"))
		if len(parts) < 2 {
			gear = append(gear, combatant.GearItem{})
			continue
		}
		itemID, _ := strconv.Atoi(parts[0])
		itemLevel, _ := strconv.Atoi(parts[1])
		item := combatant.GearItem{ItemID: itemID, ItemLevel: itemLevel}
		if len(parts) >= 3 {
			enchants := splitTopLevel(strings.Trim(parts[2], "()"))
			if len(enchants) > 0 {
				if id, _ := strconv.Atoi(enchants[0]); id != 0 {
					item.EnchantID = &id
				}
			}
		}
		gear = append(gear, item)
	}
	return gear
}

func stripRealm(name string) string {
	name = strings.TrimSuffix(name, "-")
	characterName, _, found := strings.Cut(name, "-")
	if found {
		return characterName
	}
	return name
}

var _ interface {
	Advance(context.Context) ([]messages.Message, error)
} = (*Parser)(nil)
