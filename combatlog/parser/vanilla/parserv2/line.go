package parserv2

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/ptr"
)

type Matched struct {
	parts []string
	index int
	err   error
}

// TODO: Reuse the same slice
func ParseLine(content string) (time.Time, string, *Matched, error) {
	if content == "" {
		return time.Time{}, "", nil, errors.New("empty line")
	}
	parts := strings.Split(content, "|")
	if len(parts) < 2 {
		return time.Time{}, "", nil, fmt.Errorf("invalid line format: expected at least 3 parts, got %d", len(parts))
	}

	unixMilli, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Now(), "", nil, err
	}

	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}

	if len(parts) < 3 {
		return time.UnixMilli(unixMilli), parts[1], &Matched{
			parts: []string{},
			index: 0,
		}, nil
	}

	return time.UnixMilli(unixMilli), parts[1], &Matched{
		parts: parts[2:],
		index: 0,
	}, nil
}

func (m *Matched) Error() error {
	if m.err != nil {
		return m.err
	}
	return nil
}

func (m *Matched) pop() string {
	if m.index >= len(m.parts) {
		m.SetError(errors.New("index out of bounds"))
		return ""
	}
	res := m.parts[m.index]
	m.index++
	return res
}

func (m *Matched) skip() {
	m.index++
}

func (m *Matched) Remain() int {
	return len(m.parts) - m.index
}

// nolint: unused
func (m *Matched) peek() string {
	if m.index >= len(m.parts) {
		return ""
	}
	return m.parts[m.index]
}

func (m *Matched) rest() []string {
	if m.index >= len(m.parts) {
		return []string{}
	}
	res := m.parts[m.index:]
	m.index = len(m.parts)
	return res
}

func (m *Matched) SetError(err error) {
	if m.err != nil {
		return // Do not override existing error
	}
	m.err = err
}

func parseMatch[T any](m *Matched, f func(string) (T, error)) T {
	res := m.pop()
	p, err := f(res)
	if err != nil {
		m.SetError(err)
	}

	return p
}

func (m *Matched) Guid() guid.GUID {
	return parseMatch(m, guid.FromString)
}

func (m *Matched) OptionalGuid() *guid.GUID {
	return parseMatch(m, func(s string) (*guid.GUID, error) {
		if s == "" || s == "nil" || s == "0x0000000000000000" {
			return nil, nil
		}
		id, err := guid.FromString(s)
		if err != nil {
			return nil, err
		}
		if id == 0 {
			return nil, nil
		}
		return &id, nil
	})
}

func (m *Matched) SwingHitInfo() SwingHitInfo {
	v := m.Uint64()
	return SwingHitInfo(v)
}

func (m *Matched) CastFlags() types.CastFlags {
	return parseMatch(m, func(s string) (types.CastFlags, error) {
		cf, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			return 0, err
		}
		return types.CastFlags(cf), nil
	})
}

func (m *Matched) SpellMissInfo() types.HitType {
	switch SpellMissInfo(m.Int32()) {
	case SPELL_MISS_NONE:
		return types.HitTypeNone
	case SPELL_MISS_MISS:
		return types.HitTypeMiss
	case SPELL_MISS_RESIST:
		return types.HitTypeFullResist
	case SPELL_MISS_DODGE:
		return types.HitTypeDodge
	case SPELL_MISS_PARRY:
		return types.HitTypeParry
	case SPELL_MISS_BLOCK:
		return types.HitTypeFullBlock
	case SPELL_MISS_EVADE:
		return types.HitTypeEvade
	case SPELL_MISS_IMMUNE:
		return types.HitTypeImmune
	case SPELL_MISS_IMMUNE2:
		return types.HitTypeImmune
	case SPELL_MISS_DEFLECT:
		return types.HitTypeDeflect
	case SPELL_MISS_ABSORB:
		return types.HitTypeFullAbsorb
	case SPELL_MISS_REFLECT:
		return types.HitTypeReflect
	default:
		return types.HitTypeNone
	}
}

func (m *Matched) Uint64() uint64 {
	return parseMatch(m, func(s string) (uint64, error) {
		return strconv.ParseUint(s, 10, 64)
	})
}

func (m *Matched) Uint32() uint32 {
	return parseMatch(m, func(s string) (uint32, error) {
		u, err := strconv.ParseUint(s, 10, 32)
		if err != nil {
			return 0, err
		}
		return uint32(u), nil
	})
}

func (m *Matched) OptionalUint32() uint32 {
	return parseMatch(m, func(s string) (uint32, error) {
		if s == "" || s == "nil" {
			return 0, nil
		}
		u, err := strconv.ParseUint(s, 10, 32)
		if err != nil {
			return 0, err
		}
		return uint32(u), nil
	})
}

func (m *Matched) Int32() int32 {
	return int32(m.Int64())
}

func (m *Matched) Int64() int64 {
	return parseMatch(m, func(s string) (int64, error) {
		return strconv.ParseInt(s, 10, 64)
	})
}

func (m *Matched) Bool() bool {
	return parseMatch(m, func(s string) (bool, error) {
		return strconv.ParseBool(s)
	})
}

func (m *Matched) Int32s() []int32 {
	return parseMatch(m, func(s string) ([]int32, error) {
		parts := strings.Split(s, ",")
		all := make([]int32, 0, len(parts))
		for _, p := range parts {
			v, err := strconv.ParseInt(p, 10, 32)
			if err != nil {
				return nil, err
			}
			all = append(all, int32(v))
		}

		return all, nil
	})
}

func (m *Matched) String() string {
	return m.pop()
}

func (m *Matched) School() types.School {
	i := m.Int32()
	return School(i)
}

func (m *Matched) HeroClass() types.HeroClasses {
	return parseMatch(m, func(s string) (types.HeroClasses, error) {
		return types.ParseHeroClasses(s)
	})
}

func (m *Matched) HeroRace() types.HeroRaces {
	return parseMatch(m, func(s string) (types.HeroRaces, error) {
		return types.ParseHeroRaces(s)
	})
}

func (m *Matched) HeroGender() types.HeroGender {
	return parseMatch(m, func(s string) (types.HeroGender, error) {
		genderInt, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return 0, err
		}
		return types.HeroGender(genderInt), nil
	})
}

func (m *Matched) PowerType() types.Resource {
	return PowerTypeResource(m.Int32())
}

// PowerTypeResource maps a numeric power type (as found in log lines and
// spell effect misc values) to a types.Resource.
func PowerTypeResource(ty int32) types.Resource {
	switch ty {
	case 0:
		return types.ResourceMana
	case 1:
		return types.ResourceRage
	case 2:
		return types.ResourceFocus
	case 3:
		return types.ResourceEnergy
	case 4:
		return types.ResourceHappiness
	case -2:
		return types.ResourceHealth
	default:
		return types.ResourceUnknown
	}
}

func (m *Matched) CSV() []string {
	str := m.pop()
	if str == "" {
		return []string{}
	}
	return strings.Split(str, ",")
}

// spellByIDer is the narrow interface needed by DBCSpellByID — just Spell().
type spellByIDer interface {
	Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error)
}

func (m *Matched) DBCSpellByID(ctx context.Context, db spellByIDer) *chrondbc.Spell {
	return parseMatch(m, func(s string) (*chrondbc.Spell, error) {
		id, err := strconv.ParseInt(s, 10, 32)
		if err != nil {
			return nil, err
		}

		if id <= 0 {
			return nil, nil
		}

		spell, err := db.Spell(ctx, chrondbc.SpellID(int32(id)))
		if err != nil {
			if chrondbc.IsSpellNotFound(err) {
				return ptr.Ref(chrondbc.UnknownSpell(chrondbc.SpellID(id))), nil
			}
			return nil, err
		}
		return spell, nil
	})
}
