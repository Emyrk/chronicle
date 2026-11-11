package parsernext_test

import (
	"crypto/sha256"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/ccv2"
	"github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/stretchr/testify/require"
)

func TestCCV2RecordsThroughCompleteFileReader(t *testing.T) {
	t.Parallel()
	input := "1700000000123|HEADER| player | Realm |\r\n1700000000124|SWING|opaque-guid| 42 \n1700000000125|UNKNOWN"
	type record struct {
		timestamp time.Time
		event     string
		fields    []string
	}
	var records []record
	var lines []common.Line
	summary, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: vanilla.Name}, strings.NewReader(input), 1024, func(line common.Line) error {
		// Match bufio.ScanLines' LF/CR removal without changing retained source bytes.
		content := strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r")
		timestamp, event, fields, err := ccv2.ParseLine(content)
		if err != nil {
			return err
		}
		lines = append(lines, line)
		records = append(records, record{timestamp, event, fields})
		return nil
	})
	require.NoError(t, err)
	require.Equal(t, []record{
		{time.UnixMilli(1700000000123), "HEADER", []string{"player", "Realm", ""}},
		{time.UnixMilli(1700000000124), "SWING", []string{"opaque-guid", "42"}},
		{time.UnixMilli(1700000000125), "UNKNOWN", []string{}},
	}, records)
	require.EqualValues(t, len(input), summary.Bytes)
	require.EqualValues(t, 3, summary.Lines)
	require.Equal(t, fmt.Sprintf("%x", sha256.Sum256([]byte(input))), summary.SHA256)
	require.True(t, strings.HasSuffix(lines[0].Raw, "\r\n"))
	require.True(t, strings.HasSuffix(lines[1].Raw, "\n"))
	require.EqualValues(t, len(lines[0].Raw), lines[1].Offset)
}

func TestCCV2MalformedRecordDoesNotCompleteFile(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, input, want string }{{"blank", "0|HEADER\n\n", "empty line"}, {"missing pipe", "0|HEADER\ninvalid\n", "invalid line format"}, {"timestamp", "0|HEADER\nbad|SWING\n", "strconv.ParseInt"}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			accepted := 0
			summary, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: vanilla.Name}, strings.NewReader(tc.input), 1024, func(line common.Line) error {
				_, _, _, err := ccv2.ParseLine(strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r"))
				if err == nil {
					accepted++
				}
				return err
			})
			require.ErrorContains(t, err, tc.want)
			require.ErrorContains(t, err, "visit line 2")
			require.Zero(t, summary)
			require.Equal(t, 1, accepted, "first record remains provisional, not a completed combat parse")
		})
	}
}
