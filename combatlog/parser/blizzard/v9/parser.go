package v9

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
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	wotlksynthetic "github.com/Emyrk/chronicle/combatlog/parser/wotlk/synthetic"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
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
				return nil, 0, fmt.Errorf("v9 CLEU first record has no separator")
			}
			ts, parseErr := parseTimestamp(trimmed[:idx])
			if parseErr != nil {
				return nil, 0, parseErr
			}
			return io.MultiReader(bytes.NewReader(consumed.Bytes()), reader), ts.Year(), nil
		}
		if err != nil {
			if err == io.EOF {
				return nil, 0, fmt.Errorf("v9 CLEU log is empty")
			}
			return nil, 0, fmt.Errorf("read v9 CLEU header: %w", err)
		}
	}
}

// Parser adapts Blizzard combat-log version 9 records to Chronicle's CLEU
// parser while retaining v9-only metadata such as gear and talent summaries.
type Parser struct {
	inner *wotlk.Parser
	wowDB gamedb.SpellFetcher
}

func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver, reg *registry.Registry) (*Parser, error) {
	r, year, err := readBaseYear(r)
	if err != nil {
		return nil, err
	}
	inner, err := wotlk.New(ctx, logger, newTransformReader(r), wowDB, gear, reg)
	if err != nil {
		return nil, err
	}
	inner.SetBaseYear(year)
	inner.ConfigureSynthetics(ctx, reg, wotlksynthetic.Options{
		CreditEarthShield: true,
		GenerateAbsorbs:   false,
	})
	p := &Parser{inner: inner, wowDB: wowDB}
	inner.WithEventHook("V9_COMBAT_LOG_VERSION", p.combatLogVersion)
	inner.WithEventHook("V9_ZONE_CHANGE", p.zoneChange)
	inner.WithEventHook("V9_COMBATANT_INFO", p.combatantInfo)
	inner.WithEventHook("V9_SPELL_ABSORBED", p.spellAbsorbed)
	inner.WithEventHook("V9_ENCOUNTER_START", p.encounterStart)
	inner.WithEventHook("V9_ENCOUNTER_END", p.encounterEnd)
	return p, nil
}

func (p *Parser) Advance(ctx context.Context) ([]messages.Message, error) {
	return p.inner.Advance(ctx)
}

func (p *Parser) Metrics() vanilla.Metrics {
	return p.inner.Metrics()
}

func (p *Parser) DetailedTimes() map[string]time.Duration {
	return p.inner.DetailedTimes()
}

func (p *Parser) combatLogVersion(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	version := m.String()
	values := map[string]string{"combat_log": version}
	for m.Remain() >= 2 {
		key, value := strings.ToLower(m.String()), m.String()
		values[key] = value
	}
	return []messages.Message{&messages.Versions{
		MessageBase: messages.Base(ts),
		Versions:    values,
	}}, m.Error()
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
	// v9 also includes instance and project IDs. They are not needed for the
	// activity window, but consume them when present so malformed fields surface.
	if m.Remain() > 0 {
		_ = m.Int32()
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
		return nil, fmt.Errorf("decode v9 COMBATANT_INFO: %w", err)
	}
	fields := splitTopLevel(string(raw))
	if len(fields) < 27 {
		return nil, fmt.Errorf("v9 COMBATANT_INFO has %d fields, need at least 27", len(fields))
	}

	talents, err := parseTalentSummary(fields[24])
	if err != nil {
		return nil, err
	}
	gear := parseGear(fields[26])
	return []messages.Message{&messages.Combatant{
		MessageBase: messages.Base(ts),
		Combatant: combatant.Combatant{
			Name:       stripRealm(name),
			Guid:       playerGUID,
			Seen:       ts,
			HeroClass:  "UNKNOWN",
			Gender:     -1,
			Race:       "Unknown",
			GearSetups: gear,
			Talents:    talents,
		},
	}}, nil
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
	parts := strings.Split(name, "-")
	if len(parts) >= 3 {
		return strings.Join(parts[:len(parts)-2], "-")
	}
	return name
}

var _ interface {
	Advance(context.Context) ([]messages.Message, error)
} = (*Parser)(nil)
