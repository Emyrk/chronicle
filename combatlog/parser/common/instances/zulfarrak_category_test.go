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

func TestZulFarrakStockIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorTurtle}, {database.FlavorVanilla, database.FlavorNightmareOfUrsol}} {
		zf := ZulFarrakFactory.Hostiles(flavor)
		units := unitdb.New(flavor)
		for entry, name := range map[uint32]string{7273: "Gahzrilla", 7276: "Zul'Farrak Dead Hero", 7286: "Zul'Farrak Zombie", 8138: "Sul'lithuz Broodling", 10080: "Sandarr Dunereaver", 2066: "Bonfire Damage", 62495: "", 62496: "", 62497: "", 62498: "", 62499: "", 62500: ""} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := Identity{Affiliation: types.AffiliationUnknown}
				category := unitdb.CategoryUnknown
				if name != "" && entry != 2066 && (id.IsCreature() || id.IsVehicle()) {
					want = Identity{Name: name, Affiliation: types.AffiliationHostile, Boss: entry == 7273}
					if want.Boss {
						want.EncounterName = name
					}
					category = unitdb.CategoryOrdinary
				}
				if entry == 2066 && id.IsObject() {
					want.Name, want.Category = name, unitdb.CategoryEnvironment
					category = unitdb.CategoryEnvironment
				}
				require.Equal(t, want, zf.IdentifyUnit(id), "entry %d GUID %s", entry, id)
				require.Equal(t, category, zf.UnitCategory(id))
				require.Equal(t, want.Affiliation == types.AffiliationHostile, zf.IdentifyUnit(id).CanBattle())
				outside := unitdb.CategoryUnknown
				if id.IsPet() {
					category, outside = unitdb.CategoryPet, unitdb.CategoryPet
				}
				require.Equal(t, category, units.Category(id, zf))
				require.Equal(t, outside, units.Category(id))
				require.Equal(t, outside, units.Category(id, OnyxiaHostiles(flavor)))
			}
		}
		require.NotContains(t, zf.HostileEntries(), uint32(2066))
	}
}

func TestFinalizeZulFarrakStockIdentities(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	units := unitdb.New(flavor)
	h := &Hookable{units: units, Identifier: ZulFarrakFactory.Hostiles(flavor)}
	want := map[guid.GUID]unitdb.Category{
		creatureGUID(7273, 1):  unitdb.CategoryOrdinary,
		creatureGUID(10080, 1): unitdb.CategoryOrdinary,
		creatureGUID(7785, 1):  unitdb.CategoryTotem,
		creatureGUID(8179, 1):  unitdb.CategoryTotem,
		objectGUID(2066, 1):    unitdb.CategoryEnvironment,
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
	require.Empty(t, result.UnknownUnits)
}
