package parserv2

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/ccv2"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type Matched struct {
	parts []string
	index int
	err   error
}

// ParseLine preserves the legacy field cursor while sharing lexical decoding
// with parsernext. Typed GUID/spell/combat helpers remain owned by this package.
func ParseLine(content string) (time.Time, string, *Matched, error) {
	timestamp, event, fields, err := ccv2.ParseLine(content)
	if err != nil {
		return timestamp, event, nil, err
	}
	return timestamp, event, &Matched{parts: fields}, nil
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

func (m *Matched) SpellMissInfo() types.HitType { return next.SpellMissHit(m.Int32()) }

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

func (m *Matched) Int32s() []int32 { return parseMatch(m, next.ParseInt32List) }

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
func PowerTypeResource(ty int32) types.Resource { return next.PowerTypeResource(ty) }

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
	return next.ReadSpell(ctx, db, m)
}
