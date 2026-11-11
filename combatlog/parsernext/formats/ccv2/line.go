// Package ccv2 decodes the lexical pipe-record envelope of 1.12a-cc-addon logs.
// It does not interpret GUIDs, payload fields, spell data or combat messages.
package ccv2

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseLine returns the timestamp, trimmed event name and trimmed payload fields
// of a CC-v2 record. Payload fields retain their order and empty values. An event
// without payload (including an empty event name) is lexically valid. Semantic
// validation belongs to the caller.
//
// This is the existing decoder's lexical behavior, intentionally unchanged:
// timestamp parsing happens before whitespace trimming; a timestamp parse error
// returns time.Now alongside the original *strconv.NumError; the missing-pipe
// error still says "at least 3 parts" even though two parts are accepted.
// Callers must not consume a timestamp or fields when err is non-nil.
func ParseLine(content string) (time.Time, string, []string, error) {
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
		return time.UnixMilli(unixMilli), parts[1], []string{}, nil
	}
	return time.UnixMilli(unixMilli), parts[1], parts[2:], nil
}
