package regexs

import (
	"errors"
	"regexp"
	"strconv"

	"github.com/Emyrk/chronicle/golang/wowlogs/metatypes"
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

func (m *Matched) Unit() metatypes.Unit {
	val := m.pop()
	unit, err := metatypes.ParseUnit(val)
	if err != nil {
		m.errs = append(m.errs, err)
	}
	return unit
}

func (m *Matched) String() string {
	return m.pop()
}

func (m *Matched) Uint32() uint64 {
	val := m.pop()
	v, err := strconv.ParseUint(val, 10, 32)
	if err != nil {
		m.errs = append(m.errs, err)
	}
	return v
}

func (m *Matched) Error() error {
	if len(m.errs) == 0 {
		return nil
	}
	return errors.Join(m.errs...)
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
