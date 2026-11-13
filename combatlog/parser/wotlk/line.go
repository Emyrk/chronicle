package wotlk

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
)

// ExtractUnixMilli preserves the legacy API while sharing text mechanics with
// parsernext. The leaf neither imports nor executes legacy parser code.
func ExtractUnixMilli(line string) (time.Time, string, error) {
	token, payload, err := cleu.SplitHeader(line)
	if err != nil {
		return time.Time{}, "", err
	}
	ms, err := strconv.ParseInt(token, 10, 64)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("parsing unix millis %q: %w", token, err)
	}
	return time.UnixMilli(ms), payload, nil
}

// Matched is the legacy message-specific cursor. Typed fields, GUID conversion,
// and first-error behavior remain here, outside the shared lexical layer.
type Matched struct {
	parts []string
	index int
	err   error
}

func ParseLineUnixMillis(content string) (time.Time, string, *Matched, error) {
	ts, payload, err := ExtractUnixMilli(content)
	if err != nil {
		return time.Time{}, "", nil, err
	}
	return parsePayload(ts, payload, content)
}

func ParseLine(content string) (time.Time, string, *Matched, error) {
	token, payload, err := cleu.SplitHeader(content)
	if err != nil {
		return time.Time{}, "", nil, err
	}
	ts, err := time.Parse("1/2 15:04:05.000", token)
	if err != nil {
		return time.Time{}, "", nil, fmt.Errorf("parsing timestamp %q: %w", token, err)
	}
	return parsePayload(ts, payload, content)
}

func parsePayload(ts time.Time, payload, content string) (time.Time, string, *Matched, error) {
	event, fields, err := cleu.ParsePayload(payload)
	if err != nil {
		text := content
		if len(text) > 80 {
			text = text[:80] + "..."
		}
		return time.Time{}, "", nil, fmt.Errorf("empty event type in line: %q", text)
	}
	return ts, event, &Matched{parts: fields}, nil
}

// Retained for the legacy splitter characterization tests.
func splitCSVFields(s string) []string { return cleu.SplitCSVFields(s) }

// Error returns the first parse error encountered, or nil.
func (m *Matched) Error() error {
	return m.err
}

// SetError records err if no error has been set yet.
func (m *Matched) SetError(err error) {
	if m.err == nil && err != nil {
		m.err = err
	}
}

// Remain returns the number of unconsumed fields.
func (m *Matched) Remain() int {
	return len(m.parts) - m.index
}

// pop returns the next field and advances the cursor.
// Returns "" and sets an error on out-of-bounds.
func (m *Matched) pop() string {
	if m.index >= len(m.parts) {
		m.SetError(fmt.Errorf("field index %d out of range (have %d fields)", m.index, len(m.parts)))
		return ""
	}
	v := m.parts[m.index]
	m.index++
	return v
}

// String returns the next field as a plain string (already unquoted by ParseLine).
func (m *Matched) String() string {
	return m.pop()
}

// NilString returns nil if the field is the literal "nil", otherwise returns a pointer to the string.
func (m *Matched) NilString() *string {
	s := m.pop()
	if s == "nil" || s == "" {
		return nil
	}
	return &s
}

// Guid parses the next field as a 64-bit WoW GUID ("0xABCD...").
func (m *Matched) Guid() guid.GUID {
	return parseMatch(m, func(s string) (guid.GUID, error) {
		id, err := guid.FromString(s)
		if err != nil {
			return 0, err
		}
		return syntheticGUID(id), nil
	})
}

// OptionalGuid returns nil for "0x0000000000000000", "nil", or empty fields.
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
		id = syntheticGUID(id)
		return &id, nil
	})
}

// HexUint32 parses the next field as a hex integer (e.g. "0x10512" for unit flags).
func (m *Matched) HexUint32() uint32 {
	return parseMatch(m, func(s string) (uint32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseUint(strings.TrimPrefix(s, "0x"), 16, 32)
		return uint32(v), err
	})
}

// Int32 parses the next field as a decimal int32. "nil" is treated as 0.
func (m *Matched) Int32() int32 {
	return parseMatch(m, func(s string) (int32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseInt(s, 10, 32)
		return int32(v), err
	})
}

// Int64 parses the next field as a decimal int64. "nil" is treated as 0.
func (m *Matched) Int64() int64 {
	return parseMatch(m, func(s string) (int64, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		return strconv.ParseInt(s, 10, 64)
	})
}

// Uint32 parses the next field as a decimal uint32. "nil" is treated as 0.
func (m *Matched) Uint32() uint32 {
	return parseMatch(m, func(s string) (uint32, error) {
		if s == "nil" || s == "" {
			return 0, nil
		}
		v, err := strconv.ParseUint(s, 10, 32)
		return uint32(v), err
	})
}

// School parses the next field as a types.School bitmask. In WotLK logs,
// spell prefix schools are hex ("0x1"), while suffix schools are decimal ("1").
// This method detects the "0x" prefix and parses accordingly.
func (m *Matched) School() types.School {
	return parseMatch(m, func(s string) (types.School, error) {
		if s == "nil" || s == "" {
			return types.NoneSchool, nil
		}
		if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
			v, err := strconv.ParseUint(s[2:], 16, 16)
			return types.School(v), err
		}
		v, err := strconv.ParseUint(s, 10, 16)
		return types.School(v), err
	})
}

// NilBool returns nil if the field is "nil", otherwise true for "1", false for anything else.
func (m *Matched) NilBool() *bool {
	s := m.pop()
	if s == "nil" || s == "" {
		return nil
	}
	b := s == "1"
	return &b
}

// parseMatch is a generic helper that pops a field, parses it with fn,
// and records any error.
func parseMatch[T any](m *Matched, fn func(string) (T, error)) T {
	s := m.pop()
	v, err := fn(s)
	if err != nil {
		m.SetError(fmt.Errorf("parsing field %d (%q): %w", m.index-1, s, err))
	}
	return v
}
