package leaderboardconfig

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCareerKeyQuery(t *testing.T) {
	t.Parallel()
	for _, k := range []CareerKey{
		{Instance: "Onyxia's Lair"},
		{Instance: "Naxxramas", Difficulty: "25 Player", MaxPlayers: 25},
	} {
		got, ok := ParseCareerKeyQuery(k.QueryValue())
		require.True(t, ok)
		require.Equal(t, k, got)
	}
	for _, bad := range []string{"", "Naxxramas", "Naxxramas|Normal", "|Normal|25", "Naxxramas|Normal|-1", "Naxxramas|Normal|big"} {
		_, ok := ParseCareerKeyQuery(bad)
		require.False(t, ok, bad)
	}
}

func TestCareerKeyLabel(t *testing.T) {
	t.Parallel()
	require.Equal(t, "Molten Core", CareerKey{Instance: "Molten Core"}.Label())
	require.Equal(t, "Naxxramas 25 Player 25", CareerKey{Instance: "Naxxramas", Difficulty: "25 Player", MaxPlayers: 25}.Label())
}
