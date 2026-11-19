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

func TestForeverDungeonAddIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorWoWForever}, {database.FlavorVanilla}, {database.FlavorTurtle}, {database.FlavorNightmareOfUrsol}, {database.FlavorWrath}} {
		units := unitdb.New(flavor)
		for _, tc := range []struct {
			factory *CommonFactory
			entries map[uint32]string
		}{
			{RagefireChasmFactory, map[uint32]string{8996: "Voidwalker Minion"}},
			{RuinsOfLordaeronFactory, map[uint32]string{250619: "Broodwidow", 250623: "Mangled Cadaver", 250650: "Wailing Banshee"}},
		} {
			idf := tc.factory.Hostiles(flavor)
			for entry, name := range tc.entries {
				for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
					id := guid.GUID(high | uint64(entry)<<24 | 1)
					want := unitdb.CategoryUnknown
					identity := Identity{Affiliation: types.AffiliationUnknown}
					if id.IsCreature() || id.IsVehicle() {
						want = unitdb.CategoryOrdinary
						identity = Identity{Name: name, Affiliation: types.AffiliationHostile}
					}
					require.Equal(t, want, idf.UnitCategory(id))
					require.Equal(t, identity, idf.IdentifyUnit(id))
					require.Equal(t, want == unitdb.CategoryOrdinary, idf.IdentifyUnit(id).CanBattle())
					require.False(t, idf.IdentifyUnit(id).Boss)
					outside := unitdb.CategoryUnknown
					if id.IsPet() {
						outside = unitdb.CategoryPet
					}
					require.Equal(t, outside, units.Category(id))
					require.Equal(t, outside, units.Category(id, MoltenCoreIdentifier(flavor)))
				}
			}
		}
	}
	// Dungeon-specific lists contain their adds without redundant flavor gates.
	require.Contains(t, RagefireChasmHostiles(), uint32(8996))
	for _, entry := range []uint32{250619, 250623, 250650} {
		require.Contains(t, RuinsOfLordaeronHostiles(), entry)
	}
}

func TestFinalizeForeverCategoriesAndOwnership(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorWoWForever}, {database.FlavorVanilla}} {
		for _, factory := range []*CommonFactory{RagefireChasmFactory, RuinsOfLordaeronFactory} {
			units := unitdb.New(flavor)
			h := &Hookable{units: units, Identifier: factory.Hostiles(flavor)}
			player := guid.GUID(1)
			warlock := creatureGUID(11324, 1)
			frog := creatureGUID(268744, 1)
			minion := creatureGUID(8996, 1)
			entries := []uint32{10719, 1938, 4949, 268744, 5873, 8996, 250619, 250623, 250650}
			for _, entry := range entries {
				id := creatureGUID(entry, 1)
				info := unitinfo.Info{Guid: id}
				if id == frog {
					info.Owner = &player
				}
				if id == minion {
					info.Owner = &warlock
				}
				units.Update(info)
				msg := &messages.Unit{Info: info}
				h.ObserveUnits(msg)
				h.ObserveUnits(msg)
			}
			result, err := h.Finalize(t.Context())
			require.NoError(t, err)
			for _, entry := range entries {
				id := creatureGUID(entry, 1)
				want := unitdb.CategoryUnknown
				if entry == 5873 {
					want = unitdb.CategoryTotem
				}
				if entry == 8996 && factory == RagefireChasmFactory {
					want = unitdb.CategoryOrdinary
				}
				if factory == RuinsOfLordaeronFactory && (entry == 250619 || entry == 250623 || entry == 250650) {
					want = unitdb.CategoryOrdinary
				}
				if flavor.Has(database.FlavorWoWForever) {
					switch entry {
					case 10719, 1938, 4949:
						want = unitdb.CategoryOrdinary
					case 268744:
						want = unitdb.CategoryGuardian
					}
				}
				require.Contains(t, result.PersistedUnits, id)
				require.Equal(t, want, result.UnitCategories[id])
				if want == unitdb.CategoryUnknown {
					require.Equal(t, 1, result.UnknownUnits[entry].Count)
				} else {
					require.NotContains(t, result.UnknownUnits, entry)
				}
			}
			for id, owner := range map[guid.GUID]guid.GUID{frog: player, minion: warlock} {
				info, ok := units.Get(id)
				require.True(t, ok)
				require.Equal(t, &owner, info.Owner, "classification must not change summon ownership")
			}
		}
	}
}
