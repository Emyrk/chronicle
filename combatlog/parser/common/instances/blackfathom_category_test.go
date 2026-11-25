package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestBlackfathomBossIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{
		{database.FlavorVanilla},
		{database.FlavorVanilla, database.FlavorWoWForever},
		{database.FlavorVanilla, database.FlavorTurtle},
		{database.FlavorVanilla, database.FlavorNightmareOfUrsol},
		{database.FlavorVanilla, database.FlavorLunatic},
		{database.FlavorVanilla, database.FlavorLunatic, database.FlavorNightmareOfUrsol},
		{database.FlavorWrath},
	} {
		units := unitdb.New(flavor)
		bfd := BlackfathomDeepsFactory.Hostiles(flavor)
		for entry, name := range map[uint32]string{12876: "Baron Aquanis", 62530: "Velthelaxx the Defiler"} {
			enabled := entry == 12876 || flavor.Has(database.FlavorNightmareOfUrsol)
			require.Equal(t, enabled, bfd.HostileEntries()[entry].Boss)
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := Identity{Affiliation: types.AffiliationUnknown}
				category, outside := unitdb.CategoryUnknown, unitdb.CategoryUnknown
				if enabled && (id.IsCreature() || id.IsVehicle()) {
					want = Identity{Name: name, EncounterName: name, Boss: true, Affiliation: types.AffiliationHostile}
					category = unitdb.CategoryOrdinary
				}
				require.Equal(t, want, bfd.IdentifyUnit(id), "GUID %s flavor %v", id, flavor)
				require.Equal(t, want.Boss, bfd.IdentifyUnit(id).CanBattle())
				require.Equal(t, category, bfd.UnitCategory(id))
				if id.IsPet() {
					category, outside = unitdb.CategoryPet, unitdb.CategoryPet
				}
				require.Equal(t, category, units.Category(id, bfd))
				require.Equal(t, outside, units.Category(id))
				rfc := RagefireChasmFactory.Hostiles(flavor)
				require.Equal(t, outside, units.Category(id, rfc))
				require.Equal(t, Identity{Affiliation: types.AffiliationUnknown}, rfc.IdentifyUnit(id))
			}
		}
	}
	require.NotContains(t, BlackfathomDeepsHostiles(), uint32(62530), "Ursol boss must not leak into the shared base map")
}
