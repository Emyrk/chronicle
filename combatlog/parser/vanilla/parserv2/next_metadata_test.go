package parserv2

import (
	"bufio"
	"compress/gzip"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"

	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

func TestNextMetadataParity(t *testing.T) {
	t.Parallel()
	group := make([]string, 40)
	group[0] = "1"
	group[7] = "0X2"
	lines := []string{
		"1|RG|" + strings.Join(group, ","),
		"1|RAID_COMPOSITION|roster|2|1,1,1,0;2,2,2,1",
		"1|RAID_COMPOSITION|empty|0|",
		"1|UNIT_STATE|0x0000000000000001|10|100|2|20|0|1|0.25|0.75|",
		"1|UNIT_STATE|0x0000000000000001|||||||||",
		"1|UNIT_INFO|0x0000000000000001|true|Synthetic Player|1|nil||60||100",
		"1|UNIT_INFO|0xF130001D01000001|false|Unknown|1|nil||60||100|nil",
		"1|UNIT_INFO|0x0000000000000001|true|Unknown|1|nil||60||100|0x0000000000000002",
		"1|ZONE_INFO|TEST ZONE|nil|1|raid|0",
		"1|ZONE_INFO|TEST ZONE|1|1|raid|0|2",
		"1|LOOT_TRADE|Synthetic One trades item Test Item to Synthetic Two.",
	}
	for _, line := range append([]string(nil), lines...) {
		fields := strings.Split(line, "|")
		for i := 2; i < len(fields); i++ {
			lines = append(lines, strings.Join(fields[:i], "|"))
			bad := append([]string(nil), fields...)
			bad[i] = "bad"
			lines = append(lines, strings.Join(bad, "|"))
		}
		lines = append(lines, line+"|extra")
	}
	for _, payload := range []string{"0,1,1,0", "1,0,1,0", "1,1,9,0", "1,1,1,3", "1,1,1", "1,2,1,0;2,1,1,0"} {
		lines = append(lines, fmt.Sprintf("1|RAID_COMPOSITION|roster|%d|%s", strings.Count(payload, ";")+1, payload))
	}
	for _, line := range lines {
		// Fresh state for each malformed variant detects accidental capability leaks.
		p := &Parser{ctx: t.Context(), scanner: bufio.NewScanner(strings.NewReader(line))}
		d := next.NewDecoder(nil, version.GitTag)
		want, wantErr := p.advance(t.Context())
		got, gotErr := d.DecodeRecord(t.Context(), line)
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error(), line)
		} else {
			require.NoError(t, gotErr, line)
			require.Equal(t, want, got, line)
		}
		require.Equal(t, next.Capabilities{RaidGroup: p.SawRaidGroup(), UnitResources: p.SawUnitResources(), UnitPosition: p.SawUnitPosition()}, d.Capabilities(), line)
	}
}

func TestNextPartialTelemetryCapability(t *testing.T) {
	t.Parallel()
	for _, position := range []string{"bad|0.2|0.3|", "1|bad|0.3|", "1|0.2|bad|", "1|0.2|0.3|bad"} {
		d := next.NewDecoder(nil, "")
		output, err := d.DecodeRecord(t.Context(), "1|UNIT_STATE|0x0000000000000001|10|100|2|20|0|"+position)
		require.Error(t, err)
		require.Nil(t, output)
		require.Equal(t, next.Capabilities{UnitResources: true}, d.Capabilities())
		_, err = d.DecodeRecord(t.Context(), "2|RG|bad")
		require.Error(t, err)
		require.Equal(t, next.Capabilities{UnitResources: true}, d.Capabilities())
	}
	d := next.NewDecoder(nil, "")
	_, err := d.DecodeRecord(t.Context(), "1|UNIT_STATE|0x0000000000000001|bad|100|2|20|0|1|0.2|0.3|")
	require.Error(t, err)
	require.Equal(t, next.Capabilities{}, d.Capabilities())
}

// This replay executes the original parser in order, including every HEADER,
// so version-dependent metadata remains covered in its actual source sequence.
// Unsupported parsernext records are counted, never reported as decoded parity.
func TestNextSavedMetadataSequenceParity(t *testing.T) {
	t.Parallel()
	path := os.Getenv("CHRONICLE_PARSER_PARITY_GZIP")
	if path == "" {
		t.Skip("set CHRONICLE_PARSER_PARITY_GZIP to a preserved public gzip")
	}
	file, err := os.Open(path)
	require.NoError(t, err)
	defer func() { require.NoError(t, file.Close()) }()
	reader, err := gzip.NewReader(file)
	require.NoError(t, err)
	defer func() { require.NoError(t, reader.Close()) }()
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 4<<20)
	old, err := New(t.Context(), slog.Default(), strings.NewReader(""), &stubGameDB{}, nil)
	require.NoError(t, err)
	d := next.NewDecoder(&stubGameDB{}, version.GitTag)
	unsupported := map[string]int{}
	matched := 0
	for scanner.Scan() {
		line := scanner.Text()
		old.scanner = bufio.NewScanner(strings.NewReader(line))
		want, wantErr := old.advance(t.Context())
		got, gotErr := d.DecodeRecord(t.Context(), line)
		if errors.Is(gotErr, next.ErrUnsupportedRecord) {
			_, event, _, err := ParseLine(line)
			require.NoError(t, err)
			unsupported[event]++
		} else {
			if wantErr != nil {
				require.EqualError(t, gotErr, wantErr.Error())
			} else {
				require.NoError(t, gotErr)
				require.Equal(t, want, got)
			}
			matched++
		}
		state := d.State()
		require.Equal(t, old.lastDate, state.LastTimestamp())
		gv, ok := state.Version()
		require.Equal(t, old.gameVersions != nil, ok)
		if ok {
			require.Equal(t, *old.gameVersions, gv)
		}
		require.Equal(t, next.Capabilities{RaidGroup: old.SawRaidGroup(), UnitResources: old.SawUnitResources(), UnitPosition: old.SawUnitPosition()}, d.Capabilities())
	}
	require.NoError(t, scanner.Err())
	require.Positive(t, matched)
	t.Logf("matched=%d unsupported=%v", matched, unsupported)
}
