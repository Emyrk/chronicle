package instances

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestShadowfangKeepHostiles_BossCoverage(t *testing.T) {
	t.Parallel()

	hostiles := ShadowfangKeepHostiles()
	require.True(t, hostiles[3887].Boss)
	require.Equal(t, "Baron Silverlaine", hostiles[3887].EncounterName)
	require.True(t, hostiles[4275].Boss)
	require.Equal(t, "Archmage Arugal", hostiles[4275].EncounterName)
	require.True(t, hostiles[4278].Boss)
	require.Equal(t, "Commander Springvale", hostiles[4278].EncounterName)
	require.True(t, hostiles[3872].Hostile)
	require.False(t, hostiles[3872].Boss)
}
