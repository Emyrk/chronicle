package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestRaidProgressionOrder(t *testing.T) {
	t.Parallel()

	vanilla := database.WoWFlavor{database.FlavorVanilla}
	wrath := database.WoWFlavor{database.FlavorWrath}

	require.Greater(t, RaidProgressionOrder("Naxxramas", vanilla), RaidProgressionOrder("Molten Core", vanilla))
	require.Equal(t, RaidProgressionOrder("Onyxia's Lair", vanilla), RaidProgressionOrder("Onyxia Classic", vanilla))
	require.Greater(t, RaidProgressionOrder("Upper Tower of Karazhan", vanilla), RaidProgressionOrder("Lower Tower of Karazhan", vanilla))
	require.Greater(t, RaidProgressionOrder("Icecrown Citadel", wrath), RaidProgressionOrder("Naxxramas", wrath))
	require.Less(t, RaidProgressionOrder("Onyxia's Lair", wrath), RaidProgressionOrder("Vault of Archavon", wrath))
	require.Greater(t, RaidProgressionOrder("Naxxramas", wrath), RaidProgressionOrder("Naxxramas", vanilla))
	require.Zero(t, RaidProgressionOrder("Deadmines", vanilla))
	require.Zero(t, RaidProgressionOrder("Unknown Raid", vanilla))
}
