package parserv2

import (
	"bufio"
	"compress/gzip"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

// Synthetic header: no player name, real realm or real roster is needed.
const nextHeader = "0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05|200|1.2.3|query"

func TestNextHeaderStateParity(t *testing.T) {
	t.Parallel()
	// Use legacy advance rather than header directly: this includes overriding
	// header timestamps, fatal backward jumps and clock updates before errors.
	cases := [][]string{
		{nextHeader, nextHeader, "10000|DEATH|0x0000000000000001", nextHeader, "9000|DEATH|0x0000000000000001", "7999|DEATH|0x0000000000000001"},
		{nextHeader, strings.Replace(nextHeader, "0.38.4", "invalid", 1), strings.Replace(nextHeader, "0.38.4", "0.18", 1), "1234|DEATH|bad", nextHeader},
		{"1234|DEATH|0x0000000000000001", strings.Replace(nextHeader, "23.02.26 18:17:05", "bad", 1), nextHeader},
		{"bad|HEADER", nextHeader},
	}
	fields := strings.Split(nextHeader, "|")
	for i := 2; i < len(fields); i++ {
		cases = append(cases, []string{nextHeader, strings.Join(fields[:i], "|")})
		bad := append([]string(nil), fields...)
		bad[i] = "bad"
		cases = append(cases, []string{nextHeader, strings.Join(bad, "|")})
	}
	for _, lines := range cases {
		p := &Parser{ctx: t.Context(), wowDB: &stubGameDB{}, scanner: bufio.NewScanner(strings.NewReader(strings.Join(lines, "\n")))}
		d := next.NewDecoder(&stubGameDB{}, version.GitTag)
		for _, line := range lines {
			want, wantErr := p.advance(t.Context())
			got, gotErr := d.DecodeRecord(t.Context(), line)
			if wantErr != nil {
				require.EqualError(t, gotErr, wantErr.Error(), line)
				require.Equal(t, parseerrors.IsFatalError(wantErr), parseerrors.IsFatalError(gotErr))
			} else {
				require.NoError(t, gotErr, line)
				require.Equal(t, want, got, line)
			}
			state := d.State()
			require.Equal(t, p.lastDate, state.LastTimestamp(), line)
			gv, ok := state.Version()
			require.Equal(t, p.gameVersions != nil, ok, line)
			if ok {
				require.Equal(t, *p.gameVersions, gv, line)
			}
			// Header must not claim capabilities observed only in metadata handlers.
			require.False(t, p.SawRaidGroup())
			require.False(t, p.SawUnitResources())
			require.False(t, p.SawUnitPosition())
		}
	}
}

func TestNextHeaderSourceIsolation(t *testing.T) {
	t.Parallel()
	for _, timestamp := range []string{"20000", "1000"} {
		d := next.NewDecoder(nil, "test-build")
		var emitted []messages.Message
		summary, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: next.Name}, strings.NewReader(nextHeader+"\r\n"+timestamp+"|DEATH|0x0000000000000001"), 1024, func(line common.Line) error {
			batch, err := d.DecodeRecord(t.Context(), strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r"))
			emitted = append(emitted, batch...)
			return err
		})
		require.NoError(t, err)
		require.EqualValues(t, 2, summary.Lines)
		require.Len(t, emitted, 3)
		require.Equal(t, "test-build", emitted[1].(*messages.Versions).Versions["chronicle"])
		utc, err := time.Parse("02.01.06 15:04:05", "23.02.26 18:17:05")
		require.NoError(t, err)
		require.Equal(t, utc, emitted[0].Date())
	}
	fresh := next.NewDecoder(nil, "")
	state := fresh.State()
	require.True(t, state.LastTimestamp().IsZero())
	_, ok := state.Version()
	require.False(t, ok)
	_, err := fresh.DecodeRecord(t.Context(), nextHeader)
	require.NoError(t, err)
	state = fresh.State()
	require.True(t, state.LastTimestamp().IsZero(), "header UTC fallback is not written back to the clock")
	_, err = fresh.DecodeRecord(t.Context(), "10000|UNKNOWN")
	require.NoError(t, err)
	state = fresh.State()
	require.Equal(t, time.UnixMilli(10000), state.LastTimestamp(), "unsupported semantics still observe the physical record time")
	_, err = fresh.DecodeRecord(t.Context(), "8000|DEATH|0x0000000000000001")
	require.True(t, parseerrors.IsFatalError(err))
}

func TestNextHeaderUpdateIsSeparate(t *testing.T) {
	t.Parallel()
	ts, _, m, err := ParseLine(nextHeader)
	require.NoError(t, err)
	result, err := next.DecodeHeader(ts, m, "test-build")
	require.NoError(t, err)
	state := next.HeaderState{}
	_, ok := state.Version()
	require.False(t, ok)
	require.Len(t, result.Messages, 2)
	state.ApplyHeader(result)
	gv, ok := state.Version()
	require.True(t, ok)
	require.Equal(t, "0.38.4", gv.ChronicleCompanionAddon.String())
	_, _, m, err = ParseLine(strings.Replace(nextHeader, "0.38.4", "bad", 1))
	require.NoError(t, err)
	invalid, err := next.DecodeHeader(time.Time{}, m, "test-build")
	require.NoError(t, err)
	require.Nil(t, invalid.Version)
	state.ApplyHeader(invalid)
	gv, ok = state.Version()
	require.True(t, ok)
	require.Equal(t, "0.38.4", gv.ChronicleCompanionAddon.String())
}

// Replay only header/clock interpretation; nonheader lines become DEATH probes
// with the same lexical timestamp so unsupported identity records are not parsed
// or claimed as supported. The original advance still owns the baseline clock.
func TestNextSavedHeaderStateParity(t *testing.T) {
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
	p := &Parser{ctx: t.Context()}
	d := next.NewDecoder(nil, version.GitTag)
	records, headers := 0, 0
	for scanner.Scan() {
		line := scanner.Text()
		ts, event, _, err := ParseLine(line)
		require.NoError(t, err)
		if event != "HEADER" {
			line = strconv.FormatInt(ts.UnixMilli(), 10) + "|DEATH|0x0000000000000001"
		} else {
			headers++
		}
		p.scanner = bufio.NewScanner(strings.NewReader(line))
		want, wantErr := p.advance(t.Context())
		got, gotErr := d.DecodeRecord(t.Context(), line)
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error())
		} else {
			require.NoError(t, gotErr)
			require.Equal(t, want, got)
		}
		state := d.State()
		require.Equal(t, p.lastDate, state.LastTimestamp())
		gv, ok := state.Version()
		require.Equal(t, p.gameVersions != nil, ok)
		if ok {
			require.Equal(t, *p.gameVersions, gv)
		}
		records++
	}
	require.NoError(t, scanner.Err())
	require.Positive(t, headers)
	t.Logf("header records=%d total timestamp transitions=%d", headers, records)
}

func TestNextHeaderStateSurvivesFileBoundary(t *testing.T) {
	t.Parallel()
	decoder := next.NewDecoder(nil, "test-build")
	read := func(input string) ([]messages.Message, error) {
		var output []messages.Message
		_, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: next.Name}, strings.NewReader(input), 1024, func(line common.Line) error {
			batch, err := decoder.DecodeRecord(t.Context(), strings.TrimSuffix(line.Raw, "\n"))
			output = append(output, batch...)
			return err
		})
		return output, err
	}
	_, err := read(nextHeader + "\n10000|DEATH|0x0000000000000001")
	require.NoError(t, err)
	output, err := read(strings.Replace(nextHeader, "0.38.4", "invalid", 1))
	require.NoError(t, err)
	require.Equal(t, time.UnixMilli(10000), output[0].Date())
	state := decoder.State()
	gv, ok := state.Version()
	require.True(t, ok)
	require.Equal(t, "0.38.4", gv.ChronicleCompanionAddon.String())
	_, err = read("12000|DEATH|bad")
	require.Error(t, err)
	state = decoder.State()
	require.Equal(t, time.UnixMilli(12000), state.LastTimestamp())
	_, err = read("10000|DEATH|0x0000000000000001")
	require.True(t, parseerrors.IsFatalError(err))
}
