package identifier

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestUnitCategories(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	zone := NewIdentifier(map[uint32]Identity{1: {Boss: true}, 2: {Name: "Ordinary"}, 3: {Boss: true, Category: unitdb.CategoryGuardian}, 4: {Category: unitdb.CategoryScriptedObject}})
	otherZone := NewIdentifier(map[uint32]Identity{})
	for _, test := range []struct {
		id       guid.GUID
		category unitdb.Category
	}{
		{creatureGUID(3), unitdb.CategoryGuardian}, {creatureGUID(4), unitdb.CategoryScriptedObject},
		{0, unitdb.CategoryUnknown}, {1, unitdb.CategoryPlayer},
		{creatureGUID(1), unitdb.CategoryOrdinary}, {creatureGUID(2), unitdb.CategoryOrdinary},
		{creatureGUID(2914), unitdb.CategoryCritter}, {creatureGUID(5925), unitdb.CategoryTotem},
		{creatureGUID(11859), unitdb.CategoryDemon}, {creatureGUID(12345), unitdb.CategoryUnknown},
		{guid.GUID(0xF110000000000001 | uint64(164839)<<24), unitdb.CategoryTrap},
		{guid.GUID(0xF140000000000001 | uint64(1)<<24), unitdb.CategoryPet},
	} {
		require.Equal(t, test.category, units.Category(test.id, zone), test.id.String())
	}
	require.True(t, zone.IdentifyUnit(creatureGUID(1)).Boss)
	require.True(t, zone.IdentifyUnit(creatureGUID(3)).Boss)
	require.Equal(t, unitdb.CategoryUnknown, units.Category(creatureGUID(3), otherZone))
	owner := guid.GUID(1)
	unknown := creatureGUID(12345)
	units.Update(unitinfo.Info{Guid: unknown, Name: "Named summon", Owner: &owner, Affiliation: types.AffiliationFriendly})
	require.Equal(t, unitdb.CategoryUnknown, units.Category(unknown, zone))
	require.Equal(t, unitdb.CategoryUnknown, units.Category(creatureGUID(1), otherZone))
	require.Equal(t, unitdb.CategoryOrdinary, units.Category(creatureGUID(1), zone))
}
func creatureGUID(entryID uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entryID&0xFFFFFF)<<24)
}
