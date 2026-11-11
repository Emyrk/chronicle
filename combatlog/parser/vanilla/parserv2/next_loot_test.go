package parserv2

import (
	"bufio"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/stretchr/testify/require"
)

func TestNextLootValidParity(t *testing.T) {
	t.Parallel()
	for _, line := range []string{
		"1|LOOT|Synthetic Player|cffffffff|Hitem:123:0:0:-7|h|h[Test Item]|rx2",
		"1|LOOT|Synthetic Player|cffffffff|Hitem:123:0:0:0|h|h[Test Item]|r",
		"1|LOOT|Synthetic Player|a|b|c|h[Test Item]",
		"1|LOOT|Synthetic Player|a|Hitem:bad:0:0:0|c|h[Test Item]",
		"1|LOOT|Synthetic Player|a|Hitem:123:0:0:bad|c|h[Test Item]",
		"1|LOOT|Synthetic Player|a|Hitem:123:0|c|h[Test Item]",
		"1|LOOT|Synthetic Player|a|b|c|h[Test Item]|rxno",
	} {
		require.True(t, assertRecordParity(t, &stubGameDB{}, line))
	}
	batch, err := next.DecodeRecord(t.Context(), nil, "1|LOOT|Synthetic Player|cffffffff|Hitem:123:0:0:-7|h|h[Test Item]|rx2")
	require.NoError(t, err)
	loot := batch[0].(*messages.Loot)
	require.Equal(t, "Test Item", loot.ItemName)
	require.EqualValues(t, 123, loot.ItemID)
	require.EqualValues(t, -7, loot.ItemSuffixID)
	require.EqualValues(t, 2, loot.Quantity)
}

// Run against the extracted implementation, not the original-code overlay:
// truncated payloads intentionally change from panic to ordinary decode error.
func TestNextLootTruncatedReturnsError(t *testing.T) {
	t.Parallel()
	for _, line := range []string{"1|LOOT", "1|LOOT|Synthetic Player", "1|LOOT|Synthetic Player|a", "1|LOOT|Synthetic Player|a|b", "1|LOOT|Synthetic Player|a|b|c"} {
		require.NotPanics(t, func() {
			got, err := next.DecodeRecord(t.Context(), nil, line)
			require.Error(t, err)
			require.Nil(t, got)
			p := &Parser{}
			ts, _, m, err := ParseLine(line)
			require.NoError(t, err)
			got, err = p.loot(t.Context(), ts, m)
			require.Error(t, err)
			require.Nil(t, got)
		}, line)
	}
}

func TestNextRecordOutcomes(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		line      string
		kind      string
		wantError bool
	}{
		{"1|SPELL_FAIL|not-a-guid|11578|false|89", "empty", false},
		{"1|SPELL_FAIL|0x0000000000000001|11578|false|89", "empty", false},
		{"1|SPELL_FAIL|0x0000000000000001|11578|true", "failure", false},
		{"1|SPELL_FAIL|0x0000000000000001|bad|true", "failure", true},
		{"1|SPELL_FAIL|0x0000000000000001|bad|false", "empty", true},
		{"1|SPELL_FAIL|0xBAD|11578|false", "empty", true},
		{"1|SPELL_FAIL|0x0000000000000001|11578|bad", "empty", true},
		{"1|SPELL_FAIL|0x0000000000000001", "empty", true},
		{"1|SPELL_FAIL", "empty", false},
		{"1|SPELL_FAIL|0x0000000000000001|11578", "failure", false},
		{"1|FUTURE_EVENT|  raw | payload ", "unparsed", false},
		{"1|BUFF_DURATION|unvalidated|payload", "skip", false},
		{"1|DEBUFF_DURATION", "skip", false},
		{"1|CHANNEL_START|45924|0x0000000000000001|-1", "unparsed", false},
		{"1|CHANNEL_UPDATE|45924|0x0000000000000001|0", "unparsed", false},
		{"1|COMBAT_END", "unparsed", false},
	} {
		p := &Parser{ctx: t.Context(), wowDB: &stubGameDB{}, scanner: bufio.NewScanner(strings.NewReader(tc.line))}
		got, err := p.advance(t.Context())
		batch, nextErr := next.NewDecoder(&stubGameDB{}, "").DecodeRecord(t.Context(), tc.line)
		if tc.wantError {
			require.Error(t, err)
			require.EqualError(t, nextErr, err.Error())
			require.Nil(t, batch)
			continue
		}
		require.NoError(t, err)
		require.NoError(t, nextErr)
		// The approved change clarifies the existing placeholder's reason.
		if tc.kind != "skip" {
			require.Equal(t, got, batch)
		}

		switch tc.kind {
		case "empty":
			require.Empty(t, got)
		case "failure":
			require.Len(t, got, 1)
			require.IsType(t, &messages.SpellFail{}, got[0])
		case "skip":
			require.Len(t, got, 1)
			require.Equal(t, "aura duration update not implemented", batch[0].(*messages.SkippedMessage).Reason)
		case "unparsed":
			require.Len(t, got, 1)
			require.Equal(t, tc.line, got[0].(*messages.UnparsedLine).Content)
		}
	}
}
