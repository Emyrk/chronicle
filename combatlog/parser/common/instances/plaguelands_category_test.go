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

func plaguelandsIdentities(factory *CommonFactory) map[guid.GUID]Identity {
	if factory == StratholmeFactory {
		return map[guid.GUID]Identity{
			creatureGUID(8477, 1):  {Name: "Skeletal Servant", Affiliation: types.AffiliationHostile},
			creatureGUID(11197, 1): {Name: "Mindless Skeleton", Affiliation: types.AffiliationHostile},
			creatureGUID(10461, 1): {Name: "Plagued Insect", Category: unitdb.CategoryCritter, Affiliation: types.AffiliationHostile},
			creatureGUID(10536, 1): {Name: "Plagued Maggot", Category: unitdb.CategoryCritter, Affiliation: types.AffiliationHostile},
		}
	}
	return map[guid.GUID]Identity{
		creatureGUID(10432, 1): {Name: "Vectus", EncounterName: "Vectus", Boss: true, Affiliation: types.AffiliationHostile},
		creatureGUID(10433, 1): {Name: "Marduk Blackpool", EncounterName: "Marduk Blackpool", Boss: true, Affiliation: types.AffiliationHostile},
		creatureGUID(11263, 1): {Name: "Spectral Projection", Affiliation: types.AffiliationHostile},
		creatureGUID(11598, 1): {Name: "Risen Guardian", Affiliation: types.AffiliationHostile},
		creatureGUID(10475, 1): {Name: "Scholomance Student", Affiliation: types.AffiliationNeutral},
		objectGUID(176110, 1):  {Name: "Dawn's Gambit Trap", Category: unitdb.CategoryTrap, Affiliation: types.AffiliationUnknown},
		objectGUID(177304, 1):  {Name: "Dawn's Gambit", Category: unitdb.CategoryTrap, Affiliation: types.AffiliationUnknown},
		objectGUID(179708, 1):  {Name: "Divination Scryer", Category: unitdb.CategoryObject, Affiliation: types.AffiliationUnknown},
		objectGUID(179745, 1):  {Name: "Divination Scryer Aura", Category: unitdb.CategoryObject, Affiliation: types.AffiliationUnknown},
	}
}

func TestPlaguelandsStockIdentities(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorTurtle}, {database.FlavorVanilla, database.FlavorNightmareOfUrsol}, {database.FlavorVanilla, database.FlavorWoWForever}} {
		units := unitdb.New(flavor)
		for _, factory := range []*CommonFactory{StratholmeFactory, ScholomanceFactory} {
			idf := factory.Hostiles(flavor)
			for sample, identity := range plaguelandsIdentities(factory) {
				entry, ok := sample.GetEntry()
				require.True(t, ok)
				if sample.IsObject() {
					require.NotContains(t, idf.HostileEntries(), entry)
				}
				for _, high := range []uint64{0xF130000000000000, 0xF150000000000000, 0xF110000000000000, 0xF140000000000000} {
					id := guid.GUID(high | uint64(entry)<<24 | 1)
					want := Identity{Affiliation: types.AffiliationUnknown}
					category, outside := unitdb.CategoryUnknown, unitdb.CategoryUnknown
					if sample.IsObject() == id.IsObject() && !id.IsPet() {
						want = identity
						category = identity.Category
						if category == "" {
							category = unitdb.CategoryOrdinary
						}
					}
					require.Equal(t, want, idf.IdentifyUnit(id), "entry %d GUID %s flavor %v", entry, id, flavor)
					require.Equal(t, want.Affiliation == types.AffiliationHostile || want.Affiliation == types.AffiliationNeutral, idf.IdentifyUnit(id).CanBattle())
					require.Equal(t, category, idf.UnitCategory(id))
					if id.IsPet() {
						category, outside = unitdb.CategoryPet, unitdb.CategoryPet
					}
					require.Equal(t, category, units.Category(id, idf))
					require.Equal(t, outside, units.Category(id))
					require.Equal(t, outside, units.Category(id, OnyxiaFactory.Hostiles(flavor)))
				}
			}
		}
	}
}

func TestFinalizePlaguelandsIdentitiesAndOwnership(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorWoWForever}} {
		for _, factory := range []*CommonFactory{StratholmeFactory, ScholomanceFactory} {
			units := unitdb.New(flavor)
			h := &Hookable{units: units, Identifier: factory.Hostiles(flavor)}
			want := map[guid.GUID]unitdb.Category{}
			for id, identity := range plaguelandsIdentities(factory) {
				category := identity.Category
				if category == "" {
					category = unitdb.CategoryOrdinary
				}
				want[id] = category
			}
			hawk := creatureGUID(264850, 1)
			want[hawk] = unitdb.CategoryUnknown
			if flavor.Has(database.FlavorWoWForever) {
				want[hawk] = unitdb.CategoryGuardian
			}
			for _, entry := range []uint32{8605, 257480} {
				want[creatureGUID(entry, 1)] = unitdb.CategoryUnknown
			}
			owners := map[guid.GUID]guid.GUID{hawk: guid.GUID(1)}
			if factory == StratholmeFactory {
				owners[creatureGUID(8477, 1)] = creatureGUID(10400, 1)
				owners[creatureGUID(11197, 1)] = creatureGUID(10440, 1)
			} else {
				owners[creatureGUID(11263, 1)] = creatureGUID(10498, 1)
			}
			for id := range want {
				msg := &messages.Unit{Info: unitinfo.Info{Guid: id}}
				units.Update(msg.Info)
				h.ObserveUnits(msg)
				h.ObserveUnits(msg)
				if owner, ok := owners[id]; ok {
					require.NoError(t, units.ProcessMessage(&messages.NewOwner{Target: id, NewOwner: owner}))
				}
			}
			result, err := h.Finalize(t.Context())
			require.NoError(t, err)
			require.Equal(t, want, result.UnitCategories)
			require.Len(t, result.PersistedUnits, len(want))
			for id, category := range want {
				entry, ok := id.GetEntry()
				require.True(t, ok)
				if category == unitdb.CategoryUnknown {
					require.Equal(t, 1, result.UnknownUnits[entry].Count)
					require.Equal(t, []guid.GUID{id}, result.UnknownUnits[entry].Samples)
				} else {
					require.NotContains(t, result.UnknownUnits, entry)
				}
			}
			for id, owner := range owners {
				info, ok := units.Get(id)
				require.True(t, ok)
				require.NotNil(t, info.Owner)
				require.Equal(t, owner, *info.Owner)
			}
		}
	}
}
