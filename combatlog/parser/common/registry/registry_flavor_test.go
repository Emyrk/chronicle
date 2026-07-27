package registry

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestWrathRegistryReplacesClassicOnyxia(t *testing.T) {
	t.Parallel()

	tbc := RegistryForFlavor(nil, database.WoWFlavor{database.FlavorTBC}).EntryByName("Onyxia's Lair")
	require.NotNil(t, tbc)
	require.NotNil(t, tbc.SpeedrunRules)
	require.Equal(t, []uint32{10184, 45133}, tbc.SpeedrunRules.Requirements[0].EntryIDs)

	wrath := RegistryForFlavor(nil, database.WoWFlavor{database.FlavorWrath}).EntryByName("Onyxia's Lair")
	require.NotNil(t, wrath)
	require.NotNil(t, wrath.SpeedrunRules)
	require.Nil(t, wrath.SpeedrunRules.LevelRange)
	require.Equal(t, []uint32{10184}, wrath.SpeedrunRules.Requirements[0].EntryIDs)
}
