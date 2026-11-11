package vanilla

import (
	"context"
	"errors"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"strconv"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/ccv2"
)

// ErrUnsupportedRecord indicates that this bounded decoder does not own the record.
var ErrUnsupportedRecord = errors.New("unsupported Vanilla combat record")

// DecodeRecord decodes SWING, DEATH, HEAL, SPELL_DMG, MISS, ENV_DMG and DMG_SHIELD records, without pipeline synthetic
// processing, header clock state, identity tracking or encounter publication.
// SPELL_DMG retains its local power-burn ResourceChange synthesis.
// content excludes the physical line terminator. Extra fields retain legacy
// tolerance. A successful call emits the existing concrete message payloads.
func DecodeRecord(ctx context.Context, spells SpellLookup, content string) ([]messages.Message, error) {
	ts, event, fields, err := ccv2.ParseLine(content)
	if err != nil {
		return nil, err
	}
	m := &recordFields{fields: fields}
	switch event {
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
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedRecord, event)
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
