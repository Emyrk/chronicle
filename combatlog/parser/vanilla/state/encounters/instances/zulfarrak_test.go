package instances

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestZulFarrakHostiles_BossCoverage(t *testing.T) {
	t.Parallel()

	hostiles := ZulFarrakHostiles()
	require.True(t, hostiles[7271].Boss)
	require.Equal(t, "Witch Doctor Zum'rah", hostiles[7271].EncounterName)
	require.True(t, hostiles[7267].Boss)
	require.Equal(t, "Chief Ukorz Sandscalp", hostiles[7267].EncounterName)
	require.True(t, hostiles[7796].Boss)
	require.Equal(t, "Chief Ukorz Sandscalp", hostiles[7796].EncounterName)
	require.True(t, hostiles[5648].Hostile)
	require.False(t, hostiles[5648].Boss)
	require.True(t, hostiles[7797].Hostile)
	require.False(t, hostiles[7797].Boss)
	require.False(t, hostiles[7604].Hostile)
	require.False(t, hostiles[12999].Hostile)
}
