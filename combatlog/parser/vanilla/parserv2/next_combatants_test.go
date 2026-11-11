package parserv2

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parsernext"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/stretchr/testify/require"
)

// Synthetic identities only. Preserve the real record shape and ordering.
func nextCombatantInfo(item, talent string) string {
	return "10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;" + item + ":0:0:0:0|" + talent + "||"
}

func TestNextCombatantOrderedParity(t *testing.T) {
	t.Parallel()
	info := nextCombatantInfo("1001853", "100}00}000")
	mog := "10000|COMBATANT_TRANSMOG|Player|1:33440:61053"
	tabs := "10000|COMBATANT_TALENTS|0x0000000000000001|Player|A;3;100|B;2;00|C;3;000"
	lines := []string{info, mog, mog, info, nextCombatantInfo("12345", "100}00}000"),
		"10000|COMBATANT_TRANSMOG|Player|bad&x:1:2&1:x:2&1:2:x", info,
		"10000|COMBATANT_TRANSMOG|Player|2:123:456", info,
		mog, nextCombatantInfo("33440", "100}00}000"),
		nextCombatantInfo("12345", "invalid"), tabs,
		strings.Replace(nextHeader, "0.38.4", "0.18", 1), info,
		strings.Replace(nextHeader, "0.38.4", "invalid", 1), info,
		nextHeader, info,
	}
	// Exercise every field truncation and conversion error against original handlers.
	for _, line := range []string{info, mog, tabs} {
		fields := strings.Split(line, "|")
		for i := 2; i < len(fields); i++ {
			lines = append(lines, strings.Join(fields[:i], "|"))
			bad := append([]string(nil), fields...)
			bad[i] = "bad"
			lines = append(lines, strings.Join(bad, "|"))
		}
	}
	var oldLog, newLog bytes.Buffer
	p, err := New(t.Context(), slog.New(slog.NewTextHandler(&oldLog, nil)), strings.NewReader(strings.Join(lines, "\n")), &stubGameDB{}, nil)
	require.NoError(t, err)
	d := next.NewDecoder(&stubGameDB{}, version.GitTag, next.CombatantOptions{Logger: slog.New(slog.NewTextHandler(&newLog, nil))})
	for i, line := range lines {
		want, wantErr := p.advance(t.Context())
		got, gotErr := d.DecodeRecord(t.Context(), line)
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error(), "record %d", i)
		} else {
			require.NoError(t, gotErr, "record %d", i)
			require.Equal(t, want, got, "record %d", i)
		}
	}
	require.Positive(t, strings.Count(oldLog.String(), "parsing talents, setting to nil"))
	require.Equal(t, strings.Count(oldLog.String(), "parsing talents, setting to nil"), strings.Count(newLog.String(), "parsing talents, setting to nil"))
}

func TestNextCombatantFileContinuityAndCloning(t *testing.T) {
	t.Parallel()
	d := next.NewDecoder(nil, "")
	read := func(input string) []messages.Message {
		var output []messages.Message
		_, err := parsernext.ReadFile(t.Context(), parsernext.Selection{Format: formats.VanillaCompanion, Expansion: next.Name}, strings.NewReader(input), 4096, func(line common.Line) error {
			batch, err := d.DecodeRecord(t.Context(), strings.TrimSuffix(line.Raw, "\n"))
			output = append(output, batch...)
			return err
		})
		require.NoError(t, err)
		return output
	}
	before := read(nextCombatantInfo("1001853", "100}00}000"))[0].(*messages.Combatant)
	before.GearSetups[0].ItemID = 999 // Caller must not mutate the cached snapshot.
	corrected := read("10000|COMBATANT_TRANSMOG|Player|bad&1:33440:61053")
	require.Len(t, corrected, 2)
	require.IsType(t, &messages.Transmog{}, corrected[0])
	requireCombatantItem(t, corrected[1], 33440, 61053)
	require.Equal(t, 999, before.GearSetups[0].ItemID)
	require.Empty(t, read("10000|COMBATANT_TRANSMOG|Player|bad"))
	requireCombatantItem(t, read(nextCombatantInfo("1001853", ""))[0], 33440, 61053)
	// Keep the legacy name-keyed cache even when the GUID changes.
	requireCombatantItem(t, read(strings.Replace(nextCombatantInfo("1001853", ""), "0x0000000000000001", "0x0000000000000002", 1))[0], 33440, 61053)
	requireCombatantItem(t, read(nextCombatantInfo("12345", ""))[0], 12345, 0)
	// A new transmog snapshot replaces the complete mapping set, not just its slots.
	read("10000|COMBATANT_TRANSMOG|Player|2:111:222")
	requireCombatantItem(t, read(nextCombatantInfo("1001853", ""))[0], 1001853, 0)
	fresh := next.NewDecoder(nil, "")
	got, err := fresh.DecodeRecord(t.Context(), nextCombatantInfo("1001853", ""))
	require.NoError(t, err)
	requireCombatantItem(t, got[0], 1001853, 0)
	// Mapping before the first equipment snapshot learns that snapshot's observed ID.
	d = next.NewDecoder(nil, "")
	require.Len(t, read("10000|COMBATANT_TRANSMOG|Player|1:33440:61053"), 1)
	requireCombatantItem(t, read(nextCombatantInfo("1001853", ""))[0], 33440, 61053)
}

// Opt-in replay keeps private/raw identities out of committed fixtures. All
// records reach the decoder in physical order, including unsupported families.
func TestNextSavedCombatantStateParity(t *testing.T) {
	t.Parallel()
	path := os.Getenv("CHRONICLE_PARSER_PARITY_GZIP")
	if path == "" {
		t.Skip("set CHRONICLE_PARSER_PARITY_GZIP to preserved input")
	}
	var trees *talents.TalentTreeData
	if treePath := os.Getenv("CHRONICLE_PARSER_PARITY_TALENTS"); treePath != "" {
		raw, err := os.ReadFile(treePath)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(raw, &trees))
	}
	ctx := parsectx.With(t.Context(), parsectx.Context{TalentTrees: trees})
	file, err := os.Open(path)
	require.NoError(t, err)
	defer func() { require.NoError(t, file.Close()) }()
	reader, err := gzip.NewReader(file)
	require.NoError(t, err)
	defer func() { require.NoError(t, reader.Close()) }()
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 4<<20)
	p, err := New(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), strings.NewReader(""), &stubGameDB{}, nil)
	require.NoError(t, err)
	d := next.NewDecoder(&stubGameDB{}, version.GitTag, next.CombatantOptions{TalentTrees: trees})
	counts, unsupported := map[string]int{}, map[string]int{}
	for scanner.Scan() {
		line := scanner.Text()
		_, event, _, err := ParseLine(line)
		require.NoError(t, err)
		p.scanner = bufio.NewScanner(strings.NewReader(line))
		want, wantErr := p.advance(ctx)
		got, gotErr := d.DecodeRecord(ctx, line)
		if errors.Is(gotErr, next.ErrUnsupportedRecord) {
			unsupported[event]++
			continue
		}
		if wantErr != nil {
			require.EqualError(t, gotErr, wantErr.Error())
		} else {
			require.NoError(t, gotErr)
			require.Equal(t, want, got, "event %s", event)
		}
		counts[event]++
	}
	require.NoError(t, scanner.Err())
	require.Positive(t, counts["COMBATANT_INFO"])
	t.Logf("supported histogram=%v unsupported histogram=%v", counts, unsupported)
}

// The resolver runs before explicit transmog mappings, as in the old parser.
type nextCombatantGearResolver struct{}

func (nextCombatantGearResolver) ResolveGear(gear []combatant.GearItem) { gear[0].ItemID = 777 }

func TestNextCombatantVersionAndResolver(t *testing.T) {
	t.Parallel()
	var logged bytes.Buffer
	d := next.NewDecoder(nil, "", next.CombatantOptions{Gear: nextCombatantGearResolver{}, Logger: slog.New(slog.NewTextHandler(&logged, nil))})
	decode := func(line string) []messages.Message {
		batch, err := d.DecodeRecord(t.Context(), line)
		require.NoError(t, err)
		return batch
	}
	info := nextCombatantInfo("1001853", "100}00}000")
	require.NotNil(t, decode(info)[0].(*messages.Combatant).Talents)
	decode(strings.Replace(nextHeader, "0.38.4", "0.18", 1))
	require.Nil(t, decode(info)[0].(*messages.Combatant).Talents)
	decode(strings.Replace(nextHeader, "0.38.4", "invalid", 1))
	require.Nil(t, decode(info)[0].(*messages.Combatant).Talents)
	decode(strings.Replace(nextHeader, "0.38.4", "0.19", 1))
	require.NotNil(t, decode(info)[0].(*messages.Combatant).Talents)
	require.Nil(t, decode(nextCombatantInfo("1001853", "invalid"))[0].(*messages.Combatant).Talents)
	require.Contains(t, logged.String(), "parsing talents, setting to nil")
	requireCombatantItem(t, decode(info)[0], 777, 0)
	decode("10000|COMBATANT_TRANSMOG|Player|1:33440:61053")
	requireCombatantItem(t, decode(info)[0], 33440, 61053)
}
