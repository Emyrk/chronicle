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

func TestBWLPassiveIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla, database.FlavorNightmareOfUrsol}, {database.FlavorTurtle}, {database.FlavorVanilla}, {database.FlavorVanillaPlus}, {database.FlavorWoWForever}} {
		db := unitdb.New(flavor)
		idf := BlackwingLairFactory.Hostiles(flavor)
		h := &Hookable{units: db, Identifier: idf}
		for _, tc := range []struct {
			entry    uint32
			name     string
			category unitdb.Category
		}{{10162, "Lord Victor Nefarius", unitdb.CategoryOrdinary}, {14453, "Orb of Domination", unitdb.CategoryScriptedObject}} {
			for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
				id := guid.GUID(high | uint64(tc.entry)<<24 | 1)
				want := unitdb.CategoryUnknown
				identity := Identity{Affiliation: types.AffiliationUnknown}
				if id.IsCreature() || id.IsVehicle() {
					want = tc.category
					identity = Identity{Name: tc.name, Category: want, Affiliation: types.AffiliationUnknown}
				}
				require.Equal(t, want, idf.UnitCategory(id))
				require.Equal(t, identity, idf.IdentifyUnit(id))
				require.False(t, idf.IdentifyUnit(id).CanBattle())
				require.False(t, idf.IdentifyUnit(id).Boss)
				outside := unitdb.CategoryUnknown
				if id.IsPet() {
					outside = unitdb.CategoryPet
				}
				require.Equal(t, outside, db.Category(id))
				require.Equal(t, outside, db.Category(id, MoltenCoreIdentifier(flavor)))
			}
			msg := &messages.Unit{Info: unitinfo.Info{Guid: creatureGUID(tc.entry, 1)}}
			db.Update(msg.Info)
			h.ObserveUnits(msg)
		}
		result, err := h.Finalize(t.Context())
		require.NoError(t, err)
		require.Len(t, result.PersistedUnits, 2)
		require.Empty(t, result.UnknownUnits)
		require.Equal(t, unitdb.CategoryOrdinary, result.UnitCategories[creatureGUID(10162, 1)])
		require.Equal(t, unitdb.CategoryScriptedObject, result.UnitCategories[creatureGUID(14453, 1)])
	}
}
