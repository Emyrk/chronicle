package parserv2

import (
	"bufio"
	"context"
	"errors"
	"io"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestParseLineLexicalCompatibility(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, input, event string
		millis             int64
		fields             []string
		err                string
		numericError       bool
	}{
		{name: "header", input: "1700000000123|HEADER| player | Realm |", millis: 1700000000123, event: "HEADER", fields: []string{"player", "Realm", ""}},
		{name: "trim fields not timestamp", input: "0| SWING \t| \talpha\t | beta\r", event: "SWING", fields: []string{"alpha", "beta"}},
		{name: "event without payload", input: "0|UNKNOWN", event: "UNKNOWN", fields: []string{}},
		{name: "empty event", input: "0|", fields: []string{}},
		{name: "empty payload fields", input: "0|EVENT||", event: "EVENT", fields: []string{"", ""}},
		{name: "negative timestamp", input: "-1|EVENT|value", millis: -1, event: "EVENT", fields: []string{"value"}},
		{name: "signed timestamp", input: "+1|EVENT", millis: 1, event: "EVENT", fields: []string{}},
		{name: "empty line", input: "", err: "empty line"},
		{name: "missing delimiter", input: "123", err: "invalid line format: expected at least 3 parts, got 1"},
		{name: "invalid timestamp", input: "bad|EVENT", err: `strconv.ParseInt: parsing "bad": invalid syntax`, numericError: true},
		{name: "timestamp whitespace rejected", input: " 0|EVENT", err: `strconv.ParseInt: parsing " 0": invalid syntax`, numericError: true},
		{name: "timestamp overflow", input: "9223372036854775808|EVENT", err: `strconv.ParseInt: parsing "9223372036854775808": value out of range`, numericError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ts, event, matched, err := ParseLine(tc.input)
			if tc.err != "" {
				require.EqualError(t, err, tc.err)
				require.Empty(t, event)
				require.Nil(t, matched)
				if tc.numericError {
					var numErr *strconv.NumError
					require.ErrorAs(t, err, &numErr)
					require.False(t, ts.IsZero(), "legacy numeric failure carries time.Now; intentionally preserved")
				} else {
					require.True(t, ts.IsZero())
				}
				return
			}
			require.NoError(t, err)
			require.Equal(t, time.UnixMilli(tc.millis), ts)
			require.Equal(t, tc.event, event)
			require.NotNil(t, matched)
			require.Equal(t, tc.fields, matched.parts)
			require.Zero(t, matched.index)
			require.NoError(t, matched.Error())
		})
	}
}

type lexicalErrorReader struct{ err error }

func (r lexicalErrorReader) Read([]byte) (int, error) { return 0, r.err }

// This is a known legacy limitation, not the new complete-file contract.
// Characterize it so a lexical extraction cannot accidentally change EOF policy.
func TestLegacyAdvanceMasksScannerErrors(t *testing.T) {
	t.Parallel()
	sentinel := errors.New("source failed")
	for _, tc := range []struct {
		name   string
		source io.Reader
	}{{"reader failure", lexicalErrorReader{sentinel}}, {"oversize line", strings.NewReader(strings.Repeat("x", bufio.MaxScanTokenSize+1))}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			p := &Parser{scanner: bufio.NewScanner(tc.source)}
			msgs, err := p.advance(context.Background())
			require.ErrorIs(t, err, io.EOF)
			require.Nil(t, msgs)
			require.Error(t, p.scanner.Err())
		})
	}
}
