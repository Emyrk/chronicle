package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestMoltenCoreEnvironmentCategories(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla, database.FlavorTurtle}, {database.FlavorVanilla}, {database.FlavorWrath}, {database.FlavorEpoch}} {
		units := unitdb.New(flavor)
		mc := MoltenCoreFactory.Hostiles(flavor)
		for entry, name := range map[uint32]string{178088: "Ragnaros", 13148: "Flame of Ragnaros"} {
			for _, high := range []uint64{0xF110000000000000, 0xF130000000000000, 0xF140000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := unitdb.CategoryUnknown
				identity := Identity{Affiliation: types.AffiliationUnknown}
				if flavor.Has(database.FlavorTurtle) && ((entry == 178088 && id.IsObject()) || (entry == 13148 && (id.IsCreature() || id.IsVehicle()))) {
					want = unitdb.CategoryEnvironment
					identity = Identity{Name: name, Category: want, Affiliation: types.AffiliationUnknown}
				}
				require.Equal(t, want, mc.UnitCategory(id))
				require.Equal(t, identity, mc.IdentifyUnit(id))
				require.False(t, mc.IdentifyUnit(id).CanBattle())
				outside := unitdb.CategoryUnknown
				if id.IsPet() {
					outside = unitdb.CategoryPet
				}
				require.Equal(t, outside, units.Category(id))
				require.Equal(t, outside, units.Category(id, OnyxiaHostiles(flavor)))
				if id.IsPet() {
					want = unitdb.CategoryPet
				}
				require.Equal(t, want, units.Category(id, mc))
			}
		}
		// Unverified entries and Scarshield Spellbinder remain unknown in MC.
		for _, entry := range []uint32{57645, 177704, 178164, 178194, 9098} {
			for _, high := range []uint64{0xF110000000000000, 0xF130000000000000} {
				require.Equal(t, unitdb.CategoryUnknown, units.Category(guid.GUID(high|uint64(entry)<<24|1), mc))
			}
		}
		require.NotContains(t, mc.HostileEntries(), uint32(178088))
		require.NotContains(t, MoltenCoreHostiles(), uint32(13148))
	}
}

func TestMoltenCoreObservedGlobalIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorTurtle}, {database.FlavorVanilla}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		for _, entry := range []uint32{176497, 7368, 15803, 7487} {
			for _, high := range []uint64{0xF110000000000000, 0xF130000000000000, 0xF140000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := unitdb.CategoryUnknown
				if id.IsPet() {
					want = unitdb.CategoryPet
				}
				if entry == 176497 && id.IsObject() {
					want = unitdb.CategoryObject
				}
				if entry != 176497 && id.IsCreature() {
					want = unitdb.CategoryTotem
				}
				require.Equal(t, want, units.Category(id))
				require.Equal(t, want, units.Category(id, MoltenCoreFactory.Hostiles(flavor)))
				require.Equal(t, want, units.Category(id, OnyxiaHostiles(flavor)))
			}
		}
	}
}
