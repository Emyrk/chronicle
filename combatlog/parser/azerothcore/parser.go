package azerothcore

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/azerothcore/synthetic"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	parservanilla "github.com/Emyrk/chronicle/combatlog/parser/vanilla"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

// Parser wraps the WotLK parser and handles Chronicle-specific extension
// events (CHRONICLE_UNIT_INFO, etc.) that the base WotLK parser skips as
// UnparsedLine. This gives a clean extension point for AzerothCore logs.
type Parser struct {
	inner  *wotlk.Parser
	logger *slog.Logger
	gear   gamedb.GearResolver
	wowDB  gamedb.GameDB
}

// New creates an AzerothCore parser that wraps a WotLK parser with unix
// millisecond timestamps enabled and CHRONICLE_* event handling.
func New(ctx context.Context, logger *slog.Logger, r io.Reader, wowDB gamedb.GameDB, gear gamedb.GearResolver) (*Parser, error) {
	inner, err := wotlk.New(ctx, logger, r, wowDB, gear, nil)
	if err != nil {
		return nil, err
	}

	p := &Parser{inner: inner, logger: logger, gear: gear, wowDB: wowDB}

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

// parseHeader converts a CHRONICLE_HEADER line into a messages.Realm.
//
// Fields: "realmName", "version", build
func (p *Parser) parseHeader(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	realmName := m.String()
	version := m.String()
	build := m.Int32()

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_HEADER", "error", m.Error())
		return nil, nil
	}

	return []messages.Message{
		&messages.Realm{
			MessageBase: messages.Base(ts),
			Info: realm.Info{
				Seen:      ts,
				RealmName: realmName,
				Version:   version,
				Build:     int(build),
			},
		},
	}, nil
}

// parseZoneInfo converts a CHRONICLE_ZONE_INFO line into a messages.Zone.
//
// Fields: "zoneName", mapId, instanceId, "instanceType"
func (p *Parser) parseZoneInfo(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	zoneName := m.String()
	mapID := m.Uint32()
	instanceID := m.Uint32()
	instanceType := m.String()

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_ZONE_INFO", "error", m.Error())
		return nil, nil
	}

	return []messages.Message{
		&messages.Zone{
			MessageBase: messages.Base(ts),
			Zone: zone.Zone{
				Seen:         ts,
				Name:         zoneName,
				MapID:        mapID,
				InstanceID:   instanceID,
				InstanceType: instanceType,
				IsInstance:   true,
			},
		},
	}, nil
}

// parseCombatantInfo converts a CHRONICLE_COMBATANT_INFO line into a messages.Combatant.
//
// Fields: playerGUID, "name", "class", "race", gender, level, "guild", "gearString", "talentString"
func (p *Parser) parseCombatantInfo(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	id := m.Guid()
	name := m.String()
	classStr := m.String()
	raceStr := m.String()
	genderInt := m.Int32()
	_ = m.Int32() // level — combatant.Combatant has no level field
	guildName := m.String()
	gearStr := m.String()
	talentStr := m.String()

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_COMBATANT_INFO", "error", m.Error())
		return nil, nil
	}

	heroClass, err := types.ParseHeroClasses(classStr)
	if err != nil {
		heroClass = types.HeroClassesUNKNOWN
	}

	heroRace, err := types.ParseHeroRaces(raceStr)
	if err != nil {
		heroRace = types.HeroRacesUnknown
	}

	// C++ getGender(): 0=Male, 1=Female, 2=None
	// Go HeroGender:   0=NotSet, 1=Unknown, 2=Male, 3=Female
	var gender types.HeroGender
	switch genderInt {
	case 0:
		gender = types.HeroGenderMale
	case 1:
		gender = types.HeroGenderFemale
	default:
		gender = types.HeroGenderUnknown
	}

	var guild *combatant.Guild
	if guildName != "" {
		guild = &combatant.Guild{Name: guildName}
	}

	var gear []combatant.GearItem
	if gearStr != "" {
		gear = combatant.ParseGear(strings.Split(gearStr, "&"))
		if p.gear != nil {
			p.gear.ResolveGear(gear)
		}
	}

	var talents *combatant.Talents
	if talentStr != "" {
		var err error
		talents, err = combatant.ParseTalents(talentStr)
		if err != nil {
			p.logger.Warn("failed to parse talents in CHRONICLE_COMBATANT_INFO", "error", err)
		}
	}

	return []messages.Message{
		&messages.Combatant{
			MessageBase: messages.Base(ts),
			Combatant: combatant.Combatant{
				Name:       name,
				Guid:       id,
				Seen:       ts,
				HeroClass:  heroClass,
				Gender:     gender,
				Race:       heroRace,
				Guild:      guild,
				GearSetups: gear,
				Talents:    talents,
			},
		},
	}, nil
}

// parseUnitEvade converts a CHRONICLE_UNIT_EVADE line into a messages.UnitEvade.
//
// Fields: guid, "name", why (uint8 EvadeReason)
func (p *Parser) parseUnitEvade(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	id := m.Guid()
	name := m.String()
	why := m.Int32() // uint8 on C++ side, parsed as int32

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_UNIT_EVADE", "error", m.Error())
		return nil, nil
	}

	return []messages.Message{
		&messages.UnitEvade{
			MessageBase: messages.Base(ts),
			UnitGUID:    id,
			UnitName:    name,
			Reason:      uint8(why),
		},
	}, nil
}

// parseUnitCombat converts a CHRONICLE_UNIT_COMBAT line into a messages.UnitCombatEnter.
//
// Fields: unitGuid, "unitName", victimGuid, "victimName"
func (p *Parser) parseUnitCombat(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	unitGUID := m.Guid()
	unitName := m.String()
	victimGUID := m.Guid()
	victimName := m.String()

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_UNIT_COMBAT", "error", m.Error())
		return nil, nil
	}

	return []messages.Message{
		&messages.UnitCombatEnter{
			MessageBase: messages.Base(ts),
			UnitGUID:    unitGUID,
			UnitName:    unitName,
			OtherGUID:   victimGUID,
			OtherName:   victimName,
		},
	}, nil
}

// parseUnitInfo converts a CHRONICLE_UNIT_INFO line into a messages.Unit.
//
// Fields: guid, "name", level, unitFlags (hex), ownerGuid, maxHealth, "affiliation", boss
func (p *Parser) parseUnitInfo(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	id := m.Guid()
	name := m.String()
	level := m.Int32()
	_ = m.HexUint32() // unitFlags — currently always 0, use GUID for player detection
	owner := m.OptionalGuid()
	maxHealth := m.Int64()
	affiliation := m.String()
	bossStr := m.String()

	if m.Error() != nil {
		p.logger.Warn("failed to parse CHRONICLE_UNIT_INFO", "error", m.Error())
		return nil, nil
	}

	aff := types.AffiliationUnknown
	switch strings.Trim(strings.ToLower(affiliation), `"`) {
	case "hostile":
		aff = types.AffiliationHostile
	case "friendly":
		aff = types.AffiliationFriendly
	case "neutral":
		aff = types.AffiliationNeutral
	}

	info := unitinfo.Info{
		Seen:        ts,
		Guid:        id,
		IsPlayer:    id.IsPlayer(),
		Name:        name,
		Level:       level,
		Affiliation: aff,
		Boss:        bossStr == "true",
		MaxHealth:   maxHealth,
	}
	if owner != nil && !owner.IsZero() {
		info.Owner = owner
	}

	return []messages.Message{
		&messages.Unit{
			MessageBase: messages.Base(ts),
			Info:        info,
		},
	}, nil
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

// parseSpellAbsorbed handles the SPELL_ABSORBED event emitted by the
// Chronicle module's OnDamageAbsorbed hook.
//
// Two variants (melee vs spell damage absorbed):
//
//	Melee:  <base 6>, <absorbCaster 3>, <absorbSpell 3>, amount   → 7 fields after base
//	Spell:  <base 6>, <dmgSpell 3>, <absorbCaster 3>, <absorbSpell 3>, amount  → 10 fields after base
//
// parseSpellInterrupt handles the SPELL_INTERRUPT event emitted by the
// Chronicle module's OnSpellInterrupt hook.
//
// Format: <base 6>, <interruptSpell 3>, <interruptedSpell 3>
func (p *Parser) parseSpellInterrupt(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	// Base params (6 fields).
	srcGUID := m.Guid()
	_ = m.String()    // srcName
	_ = m.HexUint32() // srcFlags
	dstGUID := m.Guid()
	_ = m.String()    // dstName
	_ = m.HexUint32() // dstFlags

	// Interrupt spell triplet (the spell that interrupted, e.g. Kick).
	intSpellID := m.Int32()
	_ = m.String() // intSpellName (resolved via DBC lookup)
	intSchool := m.School()

	// Interrupted spell triplet (the spell that was being cast).
	victimSpellID := m.Int32()
	victimSpellName := m.String()
	victimSchool := m.School()

	if err := m.Error(); err != nil {
		p.logger.Warn("failed to parse SPELL_INTERRUPT", "error", err)
		return nil, nil
	}

	_ = intSchool // not stored on Interrupt struct (available via DBC lookup)

	return []messages.Message{
		&messages.Interrupt{
			MessageBase:      messages.Base(ts),
			Caster:           srcGUID,
			Target:           dstGUID,
			SpellName:        victimSpellName,
			ExtraSpellID:     victimSpellID,
			ExtraSchool:      victimSchool,
			InterruptSpell:   p.lookupSpell(chrondbc.SpellID(intSpellID)),
			InterruptedSpell: p.lookupSpell(chrondbc.SpellID(victimSpellID)),
		},
	}, nil
}

// parseEncounterCredit converts a CHRONICLE_ENCOUNTER_CREDIT line into a
// messages.EncounterCredit so the instance tracker can close active boss fights
// even when AzerothCore does not emit a UNIT_DIED for the boss.
//
// Fields: mapId, instanceId, encounterSlot, creatureEntry, creditType,
// encounterID, "encounterName", durationSecs, unitGuid, "unitName"
func (p *Parser) parseEncounterCredit(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	_ = m.Int32()
	_ = m.Int32()
	_ = m.Int32()
	_ = m.Int32()
	_ = m.Int32()
	_ = m.Int32()
	_ = m.String()
	_ = m.Int32()
	unitGUID := m.Guid()
	unitName := m.String()

	if err := m.Error(); err != nil {
		p.logger.Warn("failed to parse CHRONICLE_ENCOUNTER_CREDIT", "error", err)
		return nil, nil
	}

	return []messages.Message{
		&messages.EncounterCredit{
			MessageBase: messages.Base(ts),
			UnitGUID:    unitGUID,
			UnitName:    unitName,
		},
	}, nil
}

// parseEncounterNoop consumes encounter bookkeeping events without producing any
// messages.
func (p *Parser) parseEncounterNoop(_ time.Time, _ *wotlk.Matched, _ string) ([]messages.Message, error) {
	return nil, nil
}

// parseChronicleNoop explicitly accepts Chronicle extension events that are
// valid for ingestion but are not persisted or surfaced yet.
func (p *Parser) parseChronicleNoop(_ time.Time, _ *wotlk.Matched, _ string) ([]messages.Message, error) {
	return nil, nil
}

func (p *Parser) parseSpellAbsorbed(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	// Base params (6 fields).
	srcGUID := m.Guid()
	_ = m.String()    // srcName
	_ = m.HexUint32() // srcFlags
	dstGUID := m.Guid()
	_ = m.String()    // dstName
	_ = m.HexUint32() // dstFlags

	// Variant detection: 10 remaining = spell, 7 remaining = melee.
	var dmgSpell *chrondbc.Spell
	if m.Remain() >= 10 {
		dmgSpellID := m.Int32()
		_ = m.String() // dmgSpellName
		_ = m.School() // dmgSpellSchool
		dmgSpell = p.lookupSpell(chrondbc.SpellID(dmgSpellID))
	}

	// Absorb caster (unit triplet).
	absorbCaster := m.Guid()
	_ = m.String()    // absorbCasterName
	_ = m.HexUint32() // absorbCasterFlags

	// Absorb spell prefix.
	absorbSpellID := m.Int32()
	_ = m.String() // absorbSpellName
	absorbSchool := m.School()

	// Amount.
	amount := m.Int32()

	if err := m.Error(); err != nil {
		p.logger.Warn("failed to parse SPELL_ABSORBED", "error", err)
		return nil, nil
	}

	absorbSpell := p.lookupSpell(chrondbc.SpellID(absorbSpellID))

	return []messages.Message{
		&messages.Absorbed{
			MessageBase:  messages.Base(ts),
			Attacker:     srcGUID,
			Target:       dstGUID,
			DamageSpell:  dmgSpell,
			Caster:       absorbCaster,
			AbsorbSpell:  absorbSpell,
			AbsorbSchool: absorbSchool,
			Amount:       amount,
		},
	}, nil
}

func (p *Parser) parseUnitDespawn(ts time.Time, m *wotlk.Matched, _ string) ([]messages.Message, error) {
	victim := m.Guid()

	if err := m.Error(); err != nil {
		p.logger.Warn("failed to parse CHRONICLE_UNIT_DESPAWN", "error", err)
		return nil, nil
	}
	return []messages.Message{
		&messages.Slain{
			MessageBase: messages.Base(ts),
			Victim:      victim,
			Killer:      nil,
			Attribution: nil,
		},
	}, nil
}
