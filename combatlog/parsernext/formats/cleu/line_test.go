package cleu

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLexicalCharacterization(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, payload, event string
		fields               []string
	}{
		{"quoted comma", ` EVENT , "name, with comma" , nil,`, "EVENT", []string{"name, with comma", "nil", ""}},
		{"event only", "EVENT", "EVENT", []string{}},
		{"whitespace event", " ,value", "", []string{"value"}},
		{"event stays quoted", `"EVENT",value`, `"EVENT"`, []string{"value"}},
		{"unbalanced quote", `EVENT,"unfinished,a,b`, "EVENT", []string{`"unfinished,a,b`}},
		{"doubled quotes retained", `EVENT,"a""b",x`, "EVENT", []string{`a""b`, "x"}},
		{"quote toggles inside unquoted field", `EVENT,a"b,c"d,z`, "EVENT", []string{`a"b,c"d`, "z"}},
		{"literal backslash", `EVENT,"a\"b,c",z`, "EVENT", []string{`"a\"b`, `c",z`}},
		{"crlf trimmed from fields", "EVENT, a\r\n", "EVENT", []string{"a"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			for _, expected := range []string{"1/2 03:04:05.006", "-123", "2026-11-12T03:04:05.006+02:00", "invalid", ""} {
				prefix := expected + "  "
				parse := ParseLine
				ts, event, fields, err := parse(prefix + tc.payload)
				require.NoError(t, err)
				require.Equal(t, expected, ts)
				require.Equal(t, tc.event, event)
				require.Equal(t, tc.fields, fields)
				require.NotNil(t, fields)
			}
		})
	}
}

func TestLexicalErrorsExact(t *testing.T) {
	t.Parallel()
	for _, parse := range []func(string) (string, string, []string, error){ParseLine} {
		for _, line := range []string{"", "no separator", strings.Repeat("x", 81)} {
			expected := "empty line"
			if line != "" {
				text := line
				if len(text) > 80 {
					text = text[:80] + "..."
				}
				expected = fmt.Sprintf("no double-space separator found in line: %q", text)
			}
			ts, event, fields, err := parse(line)
			require.EqualError(t, err, expected)
			require.Empty(t, ts)
			require.Empty(t, event)
			require.Nil(t, fields)
		}
	}
	for _, tc := range []struct {
		prefix string
		parse  func(string) (string, string, []string, error)
	}{{"1/2 03:04:05.006  ", ParseLine}, {"123  ", ParseLine}} {
		for _, payload := range []string{"", ",value"} {
			line := tc.prefix + payload
			_, _, fields, err := tc.parse(line)
			require.EqualError(t, err, fmt.Sprintf("empty event type in line: %q", line))
			require.Nil(t, fields)
		}
	}
}

func TestExtractPreservesPayload(t *testing.T) {
	t.Parallel()
	ts, payload, err := SplitHeader("+123   EVENT, \"x\"\r\n")
	require.NoError(t, err)
	require.Equal(t, "+123", ts)
	require.Equal(t, " EVENT, \"x\"\r\n", payload)
	for _, tc := range []struct {
		input  string
		fields []string
	}{{"", []string{""}}, {",", []string{"", ""}}, {`a,"b,c",d`, []string{"a", `"b,c"`, "d"}}, {`a,"b,c`, []string{"a", `"b,c`}}} {
		require.Equal(t, tc.fields, SplitCSVFields(tc.input))
	}
}
