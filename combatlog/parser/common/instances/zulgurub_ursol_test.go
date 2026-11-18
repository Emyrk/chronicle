package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestZulGurubUrsolIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla, database.FlavorOctoWoW, database.FlavorNightmareOfUrsol}, {database.FlavorVanillaPlus}, {database.FlavorTurtle}, {database.FlavorVanilla}, {database.FlavorOctoWoW}} {
		zg := ZulGurubHostiles(flavor)
		units := unitdb.New(flavor)
		for _, entry := range []uint32{15111, 15146, 15141, 177764, 25040, 25031, 25030, 0} {
			for _, high := range []uint64{0xF130000000000000, 0xF110000000000000, 0xF140000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				category := unitdb.CategoryUnknown
				affiliation := types.AffiliationUnknown
				boss := false
				creature := id.IsCreature() || id.IsVehicle()
				if creature && ((entry == 15111 || entry == 15146) && flavor.Has(database.FlavorNightmareOfUrsol, database.FlavorVanillaPlus) || (entry == 25040 || entry == 25031 || entry == 25030) && flavor.Has(database.FlavorVanillaPlus)) {
					category, affiliation = unitdb.CategoryOrdinary, types.AffiliationHostile
					boss = entry == 25031 || entry == 25030
				}
				if flavor.Has(database.FlavorNightmareOfUrsol) {
					if creature && entry == 15141 {
						category = unitdb.CategoryScriptedObject
					}
					if id.IsObject() && entry == 177764 {
						category = unitdb.CategoryEnvironment
					}
				}
				require.Equal(t, category, zg.UnitCategory(id), "flavor %v id %s", flavor, id)
				identity := zg.IdentifyUnit(id)
				require.Equal(t, affiliation, identity.Affiliation)
				require.Equal(t, boss, identity.Boss)
				require.Equal(t, affiliation == types.AffiliationHostile, identity.CanBattle())
				outside := unitdb.CategoryUnknown
				if id.IsPet() {
					outside = unitdb.CategoryPet
				}
				require.Equal(t, outside, units.Category(id, MoltenCoreIdentifier(flavor)))
				require.Equal(t, outside, units.Category(id))
			}
		}
	}
}

func TestFinalizeZulGurubUrsolIdentities(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW, database.FlavorNightmareOfUrsol}
	units := unitdb.New(flavor)
	h := &Hookable{units: units, Identifier: ZulGurubHostiles(flavor)}
	want := map[guid.GUID]unitdb.Category{
		creatureGUID(15111, 1): unitdb.CategoryOrdinary,
		creatureGUID(15146, 1): unitdb.CategoryOrdinary,
		creatureGUID(15112, 1): unitdb.CategoryTotem,
		creatureGUID(15141, 1): unitdb.CategoryScriptedObject,
		objectGUID(177764, 1):  unitdb.CategoryEnvironment,
		creatureGUID(0, 1):     unitdb.CategoryUnknown,
	}
	for id := range want {
		msg := &messages.Unit{Info: unitinfo.Info{Guid: id}}
		units.Update(msg.Info)
		h.ObserveUnits(msg)
		h.ObserveUnits(msg)
	}
	result, err := h.Finalize(t.Context())
	require.NoError(t, err)
	require.Equal(t, want, result.UnitCategories)
	require.Len(t, result.PersistedUnits, len(want))
	require.Len(t, result.UnknownUnits, 1)
	require.Equal(t, 1, result.UnknownUnits[0].Count)
	require.Equal(t, []guid.GUID{creatureGUID(0, 1)}, result.UnknownUnits[0].Samples)
}
