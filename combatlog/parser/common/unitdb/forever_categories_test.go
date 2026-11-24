package unitdb_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestForeverGlobalCreatureCategories(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorWoWForever}, {database.FlavorVanilla}, {database.FlavorTurtle}, {database.FlavorNightmareOfUrsol}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		idf := identifier.NewIdentifier(nil)
		for entry, category := range map[uint32]unitdb.Category{10719: unitdb.CategoryUnknown, 1938: unitdb.CategoryUnknown, 4949: unitdb.CategoryUnknown, 264850: unitdb.CategoryGuardian, 268744: unitdb.CategoryGuardian, 8605: unitdb.CategoryUnknown, 257480: unitdb.CategoryUnknown} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := unitdb.CategoryUnknown
				if id.IsPet() {
					want = unitdb.CategoryPet
				}
				if flavor.Has(database.FlavorWoWForever) && (id.IsCreature() || id.IsVehicle()) {
					want = category
				}
				require.Equal(t, want, units.Category(id))
				require.Equal(t, want, units.Category(id, idf))
				identity := idf.IdentifyUnit(id)
				require.Equal(t, types.AffiliationUnknown, identity.Affiliation)
				require.False(t, identity.Boss)
				require.False(t, identity.CanBattle())
			}
		}
	}
}
