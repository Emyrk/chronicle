package parserv2

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
)

func combatantInfoLine(ts, item string) string {
	return ts + "|COMBATANT_INFO|0x000000003B9C52F9|Cliffariel|HUNTER|NightElf|3|One Blood|Class Leader|2|" +
		item + "|5003020100000000000}0000000000000000}30232300511230331251||"
}

func requireCombatantItem(t *testing.T, message messages.Message, itemID, transmogID int) {
	t.Helper()
	combatantMessage, ok := message.(*messages.Combatant)
	require.True(t, ok, "expected Combatant, got %T", message)
	require.Len(t, combatantMessage.GearSetups, 1)
	require.Equal(t, itemID, combatantMessage.GearSetups[0].ItemID)
	if transmogID == 0 {
		require.Nil(t, combatantMessage.GearSetups[0].TransmogID)
	} else {
		require.NotNil(t, combatantMessage.GearSetups[0].TransmogID)
		require.Equal(t, transmogID, *combatantMessage.GearSetups[0].TransmogID)
	}
}

func TestCombatantTransmogCorrectsCurrentAndFutureEquipment(t *testing.T) {
	t.Parallel()

	const syntheticHelm = "Combatant's Chain Helm;1001853:2586:0:0:0"
	input := strings.Join([]string{
		combatantInfoLine("1793974766539", syntheticHelm),
		"1793974770323|COMBATANT_TRANSMOG|Cliffariel|1:33440:61053",
		"1793974771000|COMBATANT_TRANSMOG|Cliffariel|1:33440:61053",
		combatantInfoLine("1793974772000", syntheticHelm),
		combatantInfoLine("1793974773000", "Different Helm;12345:0:0:0:0"),
	}, "\n")

	parser, err := New(
		context.Background(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		strings.NewReader(input),
		&stubGameDB{},
		nil,
	)
	require.NoError(t, err)

	parsed, err := parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	requireCombatantItem(t, parsed[0], 1001853, 0)

	parsed, err = parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 2)
	require.IsType(t, &messages.Transmog{}, parsed[0])
	requireCombatantItem(t, parsed[1], 33440, 61053)

	// Repeated snapshots preserve the originally observed synthetic ID rather
	// than learning the already-corrected canonical ID as a new source.
	parsed, err = parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 2)
	requireCombatantItem(t, parsed[1], 33440, 61053)

	parsed, err = parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	requireCombatantItem(t, parsed[0], 33440, 61053)

	// A genuinely changed item must not be overwritten by a stale mapping.
	parsed, err = parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	requireCombatantItem(t, parsed[0], 12345, 0)
}

func TestCombatantTransmogBeforeEquipmentSnapshot(t *testing.T) {
	t.Parallel()

	input := strings.Join([]string{
		"1793974770323|COMBATANT_TRANSMOG|Cliffariel|1:33440:61053",
		combatantInfoLine("1793974772000", "Combatant's Chain Helm;1001853:2586:0:0:0"),
	}, "\n")
	parser, err := New(
		context.Background(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		strings.NewReader(input),
		&stubGameDB{},
		nil,
	)
	require.NoError(t, err)

	parsed, err := parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	require.IsType(t, &messages.Transmog{}, parsed[0])

	parsed, err = parser.Advance(context.Background())
	require.NoError(t, err)
	require.Len(t, parsed, 1)
	requireCombatantItem(t, parsed[0], 33440, 61053)
}
