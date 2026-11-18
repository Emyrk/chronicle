package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestOnyxiaEnvironmentCategories(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}
	units := unitdb.New(flavor)
	onyxia := OnyxiaHostiles(flavor)
	otherZone := identifier.NewIdentifier(map[uint32]Identity{})
	entries := []uint32{176809, 176823, 176824, 176825, 176833, 176912, 176913}
	for _, entry := range entries {
		id := guid.GUID(0xF110000000000001 | uint64(entry)<<24)
		require.Equal(t, unitdb.CategoryEnvironment, units.Category(id, onyxia), "entry %d", entry)
		require.Equal(t, unitdb.CategoryUnknown, units.Category(id, otherZone))
		require.Equal(t, unitdb.CategoryUnknown, units.Category(id))
		// Only the category changes. No hostile affiliation, boss role, name,
		// encounter hooks or battle eligibility may be inferred from it.
		identity := onyxia.IdentifyUnit(id)
		require.Equal(t, Identity{Category: unitdb.CategoryEnvironment, Affiliation: types.AffiliationUnknown}, identity)
		require.False(t, identity.CanBattle())
		for _, otherFlavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorWrath}, {database.FlavorEpoch}} {
			require.Equal(t, unitdb.CategoryUnknown, units.Category(id, OnyxiaHostiles(otherFlavor)))
		}
	}
	// Do not extrapolate to nearby entries or to every gameobject.
	require.Equal(t, unitdb.CategoryUnknown, units.Category(guid.GUID(0xF110000000000001|uint64(176810)<<24), onyxia))
	count := 0
	for _, identity := range onyxia.HostileEntries() {
		if identity.Category == unitdb.CategoryEnvironment {
			count++
		}
	}
	require.Equal(t, len(entries), count)
	for _, entry := range []uint32{10184, 12129, 11262} {
		id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
		require.Equal(t, unitdb.CategoryOrdinary, units.Category(id, onyxia))
		require.True(t, onyxia.IdentifyUnit(id).CanBattle())
		require.Equal(t, entry == 10184, onyxia.IdentifyUnit(id).Boss)
	}
	portal := guid.GUID(0xF11002B0A84D39A5)
	require.Equal(t, unitdb.CategoryObject, units.Category(portal, onyxia))
	require.Equal(t, Identity{Affiliation: types.AffiliationUnknown}, onyxia.IdentifyUnit(portal))
	require.False(t, onyxia.IdentifyUnit(portal).CanBattle())
}
