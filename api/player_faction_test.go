package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestResolvePlayerFaction(t *testing.T) {
	t.Parallel()

	explicit := database.NullWowPlayerFaction{
		WowPlayerFaction: database.WowPlayerFactionHorde,
		Valid:            true,
	}
	require.Equal(t, explicit, resolvePlayerFaction(explicit, database.WowPlayableRaceSkyborne, nil))

	alliance := database.NullWowPlayerFaction{
		WowPlayerFaction: database.WowPlayerFactionAlliance,
		Valid:            true,
	}
	require.Equal(t, alliance, resolvePlayerFaction(database.NullWowPlayerFaction{}, database.WowPlayableRaceHuman, nil))
	require.Equal(t, alliance, resolvePlayerFaction(
		database.NullWowPlayerFaction{},
		database.WowPlayableRaceBloodElf,
		database.WoWFlavor{database.FlavorNightmareOfUrsol},
	))

	horde := database.NullWowPlayerFaction{
		WowPlayerFaction: database.WowPlayerFactionHorde,
		Valid:            true,
	}
	require.Equal(t, horde, resolvePlayerFaction(database.NullWowPlayerFaction{}, database.WowPlayableRaceOrc, nil))
	require.Equal(t, horde, resolvePlayerFaction(database.NullWowPlayerFaction{}, database.WowPlayableRaceBloodElf, nil))

	require.False(t, resolvePlayerFaction(database.NullWowPlayerFaction{}, database.WowPlayableRaceSkyborne, nil).Valid)
	require.False(t, resolvePlayerFaction(database.NullWowPlayerFaction{}, database.WowPlayableRaceUnknown, nil).Valid)
}
