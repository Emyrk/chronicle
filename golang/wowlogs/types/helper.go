package types

import (
	"errors"
	"regexp"
	"strconv"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
)

type Pattern regexp.Regexp

func FromRegex(re *regexp.Regexp) *Pattern {
	p := Pattern(*re)
	return &p
}

func (p *Pattern) Match(content string) (*Matched, bool) {
	matches := p.regexp().FindStringSubmatch(content)
	if matches != nil {
		matches = matches[1:] // Remove the full match
	}
	return &Matched{
		Values: matches,
		Index:  1, // First match is at index 1
	}, matches != nil
}

func (p *Pattern) regexp() *regexp.Regexp {
	return (*regexp.Regexp)(p)
}

type Matched struct {
	Values []string
	Index  int
	errs   []error
}

func CustomMatch[T any](m *Matched, parser func(string) (T, error)) T {
	return parse(m, parser)
}

func (m *Matched) UnitOrGUID() (string, guid.GUID) {
	val := m.pop()
	if len(val) >= 18 && val[:2] == "0x" {
		gid, err := guid.FromString(val[:18])
		if err != nil {
			m.errs = append(m.errs, err)
			return "", 0
		}
		return "", gid
	}
	return val, guid.GUID(0)
}

func (m *Matched) GUID() guid.GUID       { return parse(m, guid.FromString) }
func (m *Matched) Spell() Spell          { return parse(m, ParseSpell) }
func (m *Matched) Resource() Resource    { return parse(m, ParseResource) }
func (m *Matched) HitType() HitType      { return parse(m, ParseHitMask) }
func (m *Matched) ShortHitType() HitType { return parse(m, ParseHitOrCritShort) }
func (m *Matched) Unit() Unit            { return parse(m, ParseUnit) }
func (m *Matched) Trailer() Trailer      { return parse(m, ParseTrailer) }

func (m *Matched) String() string {
	return m.pop()
}

func (m *Matched) Int32() int32 {
	val := m.pop()
	v, err := strconv.ParseInt(val, 10, 32)
	if err != nil {
		m.errs = append(m.errs, err)
	}
	return int32(v)
}

func (m *Matched) Uint32() uint32 {
	val := m.pop()
	v, err := strconv.ParseUint(val, 10, 32)
	if err != nil {
		m.errs = append(m.errs, err)
	}
	return uint32(v)
}

func (m *Matched) Error() error {
	if len(m.errs) == 0 {
		return nil
	}
	return errors.Join(m.errs...)
}

func (m *Matched) peek() string {
	if m.Index-1 >= len(m.Values) {
		m.errs = append(m.errs, errors.New("index out of range"))
		return ""
	}
	return m.Values[m.Index-1]
}

func (m *Matched) pop() string {
	if m.Index-1 >= len(m.Values) {
		m.errs = append(m.errs, errors.New("index out of range"))
		return ""
	}
	val := m.Values[m.Index-1]
	m.Index++
	return val
}

func parse[T any](m *Matched, parser func(string) (T, error)) T {
	val := m.pop()
	parsed, err := parser(val)
	if err != nil {
		m.errs = append(m.errs, err)
	}
	return parsed
}
