package unitdb_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestPortalAndLightwellObjectCategories(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{
		{database.FlavorVanilla, database.FlavorNightmareOfUrsol},
		{database.FlavorVanilla}, {database.FlavorTurtle}, {database.FlavorWrath},
	} {
		units := unitdb.New(flavor)
		for _, entry := range []uint32{176399, 181102} {
			for _, high := range []uint64{0xF110000000000000, 0xF130000000000000, 0xF140000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := unitdb.CategoryUnknown
				if id.IsPet() {
					want = unitdb.CategoryPet
				}
				if id.IsObject() && flavor.Has(database.FlavorNightmareOfUrsol) {
					want = unitdb.CategoryObject
				}
				require.Equal(t, want, units.Category(id), "flavor %v GUID %s", flavor, id)
			}
		}
	}
}
