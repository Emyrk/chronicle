// Package cleu owns CLEU header and comma-separated text mechanics only.
// Timestamp interpretation and message cursors belong to individual formats.
package cleu

import (
	"errors"
	"fmt"
	"strings"
)

// SplitHeader returns the raw timestamp token and untouched payload, separated
// at the first double space. It never validates or converts the timestamp.
func SplitHeader(line string) (timestamp, payload string, err error) {
	if line == "" {
		return "", "", errors.New("empty line")
	}
	idx := strings.Index(line, "  ")
	if idx < 0 {
		return "", "", fmt.Errorf("no double-space separator found in line: %q", truncate(line, 80))
	}
	return line[:idx], line[idx+2:], nil
}

// ParseLine preserves the raw timestamp token and parses the event and fields.
// Quotes toggle delimiter handling even when malformed; escapes are not decoded.
func ParseLine(line string) (timestamp, event string, fields []string, err error) {
	timestamp, payload, err := SplitHeader(line)
	if err != nil {
		return "", "", nil, err
	}
	event, fields, err = ParsePayload(payload)
	if err != nil {
		return "", "", nil, fmt.Errorf("empty event type in line: %q", truncate(line, 80))
	}
	return timestamp, event, fields, nil
}

// ParsePayload trims event whitespace (but not event quotes) and trims and
// unquotes fields. Empty-event checking intentionally precedes whitespace trim.
func ParsePayload(payload string) (event string, fields []string, err error) {
	parts := SplitCSVFields(payload)
	if parts[0] == "" {
		return "", nil, errors.New("empty event type")
	}
	fields = make([]string, 0, len(parts)-1)
	for _, p := range parts[1:] {
		fields = append(fields, unquote(strings.TrimSpace(p)))
	}
	return strings.TrimSpace(parts[0]), fields, nil
}

// unquote strips surrounding double quotes if present.
func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}

// SplitCSVFields splits a comma-separated string, treating commas inside
// double-quoted segments as literal characters rather than delimiters.
// This handles AzerothCore spell descriptions like:
//
//	"Defensive State - Follows a successful block, dodge or parry."
//
// Quotes are NOT stripped here; that happens in unquote() during field processing.
func SplitCSVFields(s string) []string {
	fields := make([]string, 0, 16)
	start := 0
	inQuotes := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			inQuotes = !inQuotes
		case ',':
			if !inQuotes {
				fields = append(fields, s[start:i])
				start = i + 1
			}
		}
	}
	fields = append(fields, s[start:])
	return fields
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
