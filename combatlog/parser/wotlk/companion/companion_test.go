package companion_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	legacy "github.com/Emyrk/chronicle/combatlog/parser/wotlk/companion"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLegacyImportPathDelegatesToParsernextOwner(t *testing.T) {
	t.Parallel()
	parser := legacy.New(slog.Default())
	ts := time.Unix(1, 0)

	decoded, err := parser.Feed(ts, `[3Z:Dalaran,none,0,,0,0,0,571,0,]`)
	require.NoError(t, err)
	require.Len(t, decoded, 1)
	zone, ok := decoded[0].(*messages.Zone)
	require.True(t, ok)
	assert.Equal(t, "dalaran", zone.Name)
	assert.Equal(t, uint32(571), zone.MapID)
}

func TestLegacyImportPathPreservesPublicHelpers(t *testing.T) {
	t.Parallel()
	assert.True(t, legacy.IsCompanionMessage("[1payload]"))
	assert.False(t, legacy.IsCompanionMessage("payload"))

	clock, err := legacy.ParseHeaderClock("H:0.8,Tel'Abim,enUS,3.3.5a,12340,session,1786243259341,-360")
	require.NoError(t, err)
	require.NotNil(t, clock)
	assert.Equal(t, 6*time.Hour, clock.Offset)
}

func TestLegacyImportPathPreservesRaidGroupState(t *testing.T) {
	t.Parallel()
	parser := legacy.New(slog.Default())
	fields := make([]byte, 0, messages.RaidGroupCount*messages.RaidGroupSize)
	for i := 0; i < messages.RaidGroupCount*messages.RaidGroupSize-1; i++ {
		fields = append(fields, ',')
	}
	_, err := parser.Feed(time.Unix(1, 0), "[1RG:"+string(fields)+"]")
	require.NoError(t, err)
	assert.True(t, parser.SawRaidGroup())
}
