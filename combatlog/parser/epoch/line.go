package epoch

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
)

// Matched is a stateful cursor over comma-separated fields from a WotLK
// COMBAT_LOG_EVENT_UNFILTERED line. Fields are consumed sequentially via typed
// getter methods. The first parse error is recorded and never overwritten.
type Matched struct {
	parts []string
	index int
	err   error
}

// ParseLine parses a WotLK combat log line of the form:
//
//	M/DD HH:MM:SS.mmm  EVENT,field,field,...
//
// It returns the timestamp (year 0 — caller must add year), event type string,
// and a Matched cursor over the remaining comma-separated fields.
func ParseLine(content string) (time.Time, string, *Matched, error) {
	if content == "" {
		return time.Time{}, "", nil, errors.New("empty line")
	}

	// Find the double-space separator between timestamp and payload.
	idx := strings.Index(content, "  ")
	if idx < 0 {
		return time.Time{}, "", nil, fmt.Errorf("no double-space separator found in line: %q", truncate(content, 80))
	}

	tsStr := content[:idx]
	payload := content[idx+2:]

	ts, err := time.Parse("1/2 15:04:05.000", tsStr)
	if err != nil {
		return time.Time{}, "", nil, fmt.Errorf("parsing timestamp %q: %w", tsStr, err)
	}

	// Split payload on commas. WoW names cannot contain commas, so this is safe.
	parts := strings.Split(payload, ",")
	if len(parts) < 1 || parts[0] == "" {
		return time.Time{}, "", nil, fmt.Errorf("empty event type in line: %q", truncate(content, 80))
	}

	event := strings.TrimSpace(parts[0])

	// Strip double quotes from all remaining fields.
	fields := make([]string, 0, len(parts)-1)
	for _, p := range parts[1:] {
		fields = append(fields, unquote(strings.TrimSpace(p)))
	}

	return ts, event, &Matched{parts: fields, index: 0}, nil
}

// unquote strips surrounding double quotes if present.
func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

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
	return parseMatch(m, guid.FromString)
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
