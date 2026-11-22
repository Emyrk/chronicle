package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestOnyxiaEnvironmentCategories(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}
	units := unitdb.New(flavor)
	onyxia := OnyxiaHostiles(flavor)
	otherZone := identifier.NewIdentifier(map[uint32]Identity{})
	entries := []uint32{176809, 176823, 176824, 176825, 176833, 176912, 176913}
	for _, entry := range entries {
		id := guid.GUID(0xF110000000000001 | uint64(entry)<<24)
		require.Equal(t, unitdb.CategoryEnvironment, units.Category(id, onyxia), "entry %d", entry)
		require.Equal(t, unitdb.CategoryUnknown, units.Category(id, otherZone))
		require.Equal(t, unitdb.CategoryUnknown, units.Category(id))
		// Only the category changes. No hostile affiliation, boss role, name,
		// encounter hooks or battle eligibility may be inferred from it.
		identity := onyxia.IdentifyUnit(id)
		require.Equal(t, Identity{Category: unitdb.CategoryEnvironment, Affiliation: types.AffiliationUnknown}, identity)
		require.False(t, identity.CanBattle())
		creature := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
		require.Equal(t, unitdb.CategoryUnknown, units.Category(creature, onyxia))
		require.Equal(t, Identity{Affiliation: types.AffiliationUnknown}, onyxia.IdentifyUnit(creature))
		require.NotContains(t, onyxia.HostileEntries(), entry)
		for _, otherFlavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorWrath}, {database.FlavorEpoch}} {
			require.Equal(t, unitdb.CategoryUnknown, units.Category(id, OnyxiaHostiles(otherFlavor)))
		}
	}
	// Do not extrapolate to nearby entries or to every gameobject.
	require.Equal(t, unitdb.CategoryUnknown, units.Category(guid.GUID(0xF110000000000001|uint64(176810)<<24), onyxia))
	count := 0
	for _, identity := range onyxia.HostileEntries() {
		if identity.Category == unitdb.CategoryEnvironment {
			count++
		}
	}
	require.Zero(t, count)
	for _, entry := range []uint32{10184, 12129, 11262} {
		id := guid.GUID(0xF130000000000001 | uint64(entry)<<24)
		require.Equal(t, unitdb.CategoryOrdinary, units.Category(id, onyxia))
		require.True(t, onyxia.IdentifyUnit(id).CanBattle())
		require.Equal(t, entry == 10184, onyxia.IdentifyUnit(id).Boss)
		object := objectGUID(entry, 1)
		require.Equal(t, unitdb.CategoryUnknown, units.Category(object, onyxia))
		require.Equal(t, Identity{Affiliation: types.AffiliationUnknown}, onyxia.IdentifyUnit(object))
	}
	portal := guid.GUID(0xF11002B0A84D39A5)
	require.Equal(t, unitdb.CategoryObject, units.Category(portal, onyxia))
	require.Equal(t, Identity{Affiliation: types.AffiliationUnknown}, onyxia.IdentifyUnit(portal))
	require.False(t, onyxia.IdentifyUnit(portal).CanBattle())
}

func TestOnyxiaSharedLavaFissures(t *testing.T) {
	t.Parallel()
	samples := map[uint32]string{
		176513: "0xF11002B181014037", 176514: "0xF11002B182014038",
		176811: "0xF11002B2AB01403C", 176831: "0xF11002B2BF014050",
		176832: "0xF11002B2C0014051", 176842: "0xF11002B2CA01405B",
		176827: "0xF11002B2BB01404C", 176828: "0xF11002B2BC01404D",
		176829: "0xF11002B2BD01404E", 176830: "0xF11002B2BE01404F",
	}
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorTurtle}, {database.FlavorVanilla, database.FlavorNightmareOfUrsol}, {database.FlavorVanilla, database.FlavorEpoch}} {
		onyxia := OnyxiaFactory.Hostiles(flavor)
		units := unitdb.New(flavor)
		for entry, sample := range samples {
			parsed, err := guid.FromString(sample)
			require.NoError(t, err)
			require.True(t, parsed.IsObject())
			gotEntry, ok := parsed.GetEntry()
			require.True(t, ok)
			require.Equal(t, entry, gotEntry)
			require.Equal(t, unitdb.CategoryEnvironment, units.Category(parsed, onyxia))
			require.NotContains(t, onyxia.HostileEntries(), entry)
			for _, high := range []uint64{0xF110000000000000, 0xF130000000000000, 0xF140000000000000, 0xF150000000000000} {
				id := guid.GUID(high | uint64(entry)<<24 | 1)
				want := Identity{Affiliation: types.AffiliationUnknown}
				category, outside := unitdb.CategoryUnknown, unitdb.CategoryUnknown
				if id.IsObject() {
					want.Category = unitdb.CategoryEnvironment
					category = unitdb.CategoryEnvironment
				}
				require.Equal(t, want, onyxia.IdentifyUnit(id))
				require.False(t, onyxia.IdentifyUnit(id).CanBattle())
				require.Equal(t, category, onyxia.UnitCategory(id))
				if id.IsPet() {
					category, outside = unitdb.CategoryPet, unitdb.CategoryPet
				}
				require.Equal(t, category, units.Category(id, onyxia))
				require.Equal(t, outside, units.Category(id))
				require.Equal(t, outside, units.Category(id, MoltenCoreIdentifier(flavor)))
			}
		}
		// Previously recognized fissures remain Turtle-only.
		for _, entry := range []uint32{176809, 176823, 176824, 176825, 176833, 176912, 176913} {
			want := unitdb.CategoryUnknown
			if flavor.Has(database.FlavorTurtle) {
				want = unitdb.CategoryEnvironment
			}
			require.Equal(t, want, onyxia.UnitCategory(objectGUID(entry, 1)))
		}
	}
}

func TestFinalizeOnyxiaSharedObjects(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	units := unitdb.New(flavor)
	h := &Hookable{units: units, Identifier: OnyxiaFactory.Hostiles(flavor)}
	want := map[guid.GUID]unitdb.Category{
		guid.GUID(0xF11002B181014037): unitdb.CategoryEnvironment,
		guid.GUID(0xF11002B182014038): unitdb.CategoryEnvironment,
		guid.GUID(0xF11002B2AB01403C): unitdb.CategoryEnvironment,
		guid.GUID(0xF11002B2BF014050): unitdb.CategoryEnvironment,
		guid.GUID(0xF11002B2C0014051): unitdb.CategoryEnvironment,
		guid.GUID(0xF11002B2CA01405B): unitdb.CategoryEnvironment,
		objectGUID(176827, 1):         unitdb.CategoryEnvironment,
		objectGUID(176828, 1):         unitdb.CategoryEnvironment,
		objectGUID(176829, 1):         unitdb.CategoryEnvironment,
		objectGUID(176830, 1):         unitdb.CategoryEnvironment,
		objectGUID(176499, 1):         unitdb.CategoryObject,
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
