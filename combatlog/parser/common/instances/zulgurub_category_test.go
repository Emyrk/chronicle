package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestZulGurubCategoryOnlyIdentities(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}
	units := unitdb.New(flavor)
	zg := ZulGurubHostiles(flavor)
	for _, tc := range []struct {
		entry    uint32
		object   bool
		category unitdb.Category
	}{
		{2061, true, unitdb.CategoryEnvironment},
		{14122, false, unitdb.CategoryEnvironment},
		{10218, false, unitdb.CategoryTotem},
	} {
		for _, ns := range []struct {
			high        uint64
			object, pet bool
		}{
			{0xF110000000000000, true, false},
			{0xF130000000000000, false, false},
			{0xF150000000000000, false, false},
			{0xF140000000000000, false, true},
		} {
			id := guid.GUID(ns.high | uint64(tc.entry)<<24 | 1)
			want := unitdb.CategoryUnknown
			identity := Identity{Affiliation: types.AffiliationUnknown}
			if ns.object == tc.object && !ns.pet {
				want = tc.category
				identity.Category = tc.category
			}
			require.Equal(t, want, zg.UnitCategory(id), "entry %d namespace %x", tc.entry, ns.high)
			require.Equal(t, identity, zg.IdentifyUnit(id))
			require.False(t, identity.CanBattle())
			if ns.pet {
				want = unitdb.CategoryPet
			}
			require.Equal(t, want, units.Category(id, zg))
			outside := unitdb.CategoryUnknown
			if ns.pet {
				outside = unitdb.CategoryPet
			}
			require.Equal(t, outside, units.Category(id))
			require.Equal(t, outside, units.Category(id, OnyxiaHostiles(flavor)))
			for _, other := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanillaPlus}, {database.FlavorWrath}} {
				require.Equal(t, outside, units.Category(id, ZulGurubHostiles(other)))
			}
		}
	}
}

func TestZulGurubShadeIdentity(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorTurtle}} {
		zg := ZulGurubHostiles(flavor)
		for _, high := range []uint64{0xF130000000000000, 0xF150000000000000} {
			id := guid.GUID(high | uint64(14986)<<24 | 1)
			require.Equal(t, unitdb.CategoryOrdinary, zg.UnitCategory(id))
			identity := zg.IdentifyUnit(id)
			require.Equal(t, types.AffiliationHostile, identity.Affiliation)
			require.Equal(t, "Shade of Jin'do", identity.Name)
			require.False(t, identity.Boss)
			require.True(t, identity.CanBattle())
			require.Equal(t, unitdb.CategoryUnknown, OnyxiaHostiles(flavor).UnitCategory(id))
		}
		for _, high := range []uint64{0xF110000000000000, 0xF140000000000000} {
			require.Equal(t, unitdb.CategoryUnknown, zg.UnitCategory(guid.GUID(high|uint64(14986)<<24|1)))
		}
	}
}
