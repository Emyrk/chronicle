package vanilla

import (
	"context"
	"errors"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/ccv2"
)

// ErrUnsupportedRecord indicates a stateful record used with the stateless entry point.
var ErrUnsupportedRecord = errors.New("unsupported Vanilla combat record")

// DecodeRecord decodes the explicitly selected Vanilla combat record families:
// damage/heal/death, spell start/go, aura add/remove/cast, energize, dispel,
// roster/telemetry/unit/zone metadata, loot, failure and placeholder outcomes.
// It does not perform pipeline synthetic processing, header clock state,
// combatant state (use Decoder), identity tracking or encounter publication.
// SPELL_DMG retains its local
// power-burn ResourceChange synthesis. Stateful records require Decoder; unknown
// names retain their content in UnparsedLine.
// content excludes the physical line terminator; extra fields retain legacy
// tolerance. Successful calls emit the existing concrete message payloads.
func DecodeRecord(ctx context.Context, spells SpellLookup, content string) ([]messages.Message, error) {
	ts, event, fields, err := ccv2.ParseLine(content)
	if err != nil {
		return nil, err
	}
	return decodeFields(ctx, spells, ts, event, fields, content)
}

func decodeFields(ctx context.Context, spells SpellLookup, ts time.Time, event string, fields []string, content string) ([]messages.Message, error) {
	m := &recordFields{fields: fields}
	switch event {
	case "HEADER", "COMBATANT_INFO", "COMBATANT_TRANSMOG", "COMBATANT_TALENTS":
		return nil, fmt.Errorf("%w: %s requires Decoder state", ErrUnsupportedRecord, event)
	case "SPELL_FAIL":
		return DecodeSpellFail(ctx, spells, ts, m)
	case "BUFF_DURATION", "DEBUFF_DURATION":
		return DecodeAuraDuration(ts)
	case "LOOT":
		return DecodeLoot(ts, m)
	case "RG", "RAID_COMPOSITION", "UNIT_STATE":
		r, err := decodeCapabilityRecord(ts, event, m)
		return r.Messages, err
	case "UNIT_INFO":
		return DecodeUnitInfo(ts, m)
	case "ZONE_INFO":
		return DecodeZoneInfo(ts, m)
	case "LOOT_TRADE":
		return DecodeLootTrade(ts, m)

	case "SPELL_START", "SPELL_GO", "AURA_CAST", "ENERGIZE", "DISPEL", "BUFF_ADD", "BUFF_REM", "DEBUFF_ADD", "DEBUFF_REM":
		if spells == nil {
			return nil, fmt.Errorf("%s requires spell lookup", event)
		}
		switch event {
		case "SPELL_START":
			return DecodeSpellStart(ctx, spells, ts, m)
		case "SPELL_GO":
			return DecodeSpellGo(ctx, spells, ts, m)
		case "AURA_CAST":
			return DecodeAuraCast(ctx, spells, ts, m)
		case "ENERGIZE":
			return DecodeEnergize(ctx, spells, ts, m)
		case "DISPEL":
			return DecodeDispel(ctx, spells, ts, m)
		default:
			return DecodeAura(ctx, spells, event, ts, event == "BUFF_ADD" || event == "BUFF_REM", m)
		}

	case "SWING":
		if spells == nil {
			return nil, errors.New("SWING requires spell lookup")
		}
		return DecodeSwing(ctx, spells, ts, m)
	case "MISS", "ENV_DMG", "DMG_SHIELD":
		if spells == nil {
			return nil, fmt.Errorf("%s requires spell lookup", event)
		}
		switch event {
		case "MISS":
			return DecodeMiss(ctx, spells, ts, m)
		case "ENV_DMG":
			return DecodeEnvironmentDamage(ctx, spells, ts, m)
		default:
			return DecodeDamageShield(ctx, spells, ts, m)
		}
	case "HEAL", "SPELL_DMG":
		if spells == nil {
			return nil, fmt.Errorf("%s requires spell lookup", event)
		}
		if event == "HEAL" {
			return DecodeHeal(ctx, spells, ts, m)
		}
		return DecodeSpellDamage(ctx, spells, ts, m)
	case "DEATH":
		return DecodeDeath(ts, m)
	default:
		return messages.Unparsed(ts, content), nil
	}
}

type recordFields struct {
	fields []string
	index  int
	err    error
}

func (m *recordFields) pop() string {
	if m.index >= len(m.fields) {
		m.fail(errors.New("index out of bounds"))
		return ""
	}
	s := m.fields[m.index]
	m.index++
	return s
}
func (m *recordFields) fail(err error) {
	if m.err == nil {
		m.err = err
	}
}
func (m *recordFields) Error() error    { return m.err }
func (m *recordFields) Guid() guid.GUID { v, err := guid.FromString(m.pop()); m.fail(err); return v }
func (m *recordFields) Int64() int64 {
	v, err := strconv.ParseInt(m.pop(), 10, 64)
	m.fail(err)
	return v
}
func (m *recordFields) Int32() int32 { return int32(m.Int64()) }
func (m *recordFields) SwingHitInfo() SwingHitInfo {
	v, err := strconv.ParseUint(m.pop(), 10, 64)
	m.fail(err)
	return SwingHitInfo(v)
}

func (m *recordFields) String() string       { return m.pop() }
func (m *recordFields) SetError(err error)   { m.fail(err) }
func (m *recordFields) School() types.School { return School(m.Int32()) }
func (m *recordFields) Int32s() []int32      { v, err := ParseInt32List(m.pop()); m.fail(err); return v }

func (m *recordFields) Peek() string {
	if m.index >= len(m.fields) {
		return ""
	}
	return m.fields[m.index]
}
func (m *recordFields) Skip() { m.index++ }

func (m *recordFields) Remain() int { return len(m.fields) - m.index }

func (m *recordFields) OptionalGuid() *guid.GUID { return ReadOptionalGUID(m) }
func (m *recordFields) OptionalUint32() uint32   { return ReadOptionalUint32(m) }
func (m *recordFields) Bool() bool               { v, err := strconv.ParseBool(m.pop()); m.fail(err); return v }
func (m *recordFields) CSV() []string {
	raw := m.pop()
	if raw == "" {
		return []string{}
	}
	return strings.Split(raw, ",")
}

func (m *recordFields) Rest() []string {
	if m.index >= len(m.fields) {
		return []string{}
	}
	rest := m.fields[m.index:]
	m.index = len(m.fields)
	return rest
}

func (m *recordFields) HeroClass() types.HeroClasses {
	v, err := types.ParseHeroClasses(m.pop())
	m.fail(err)
	return v
}
func (m *recordFields) HeroRace() types.HeroRaces {
	v, err := types.ParseHeroRaces(m.pop())
	m.fail(err)
	return v
}
func (m *recordFields) HeroGender() types.HeroGender { return types.HeroGender(m.Int64()) }
