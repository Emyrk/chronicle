package chronicle

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestIdentityInstanceFinalizedCatalogue(t *testing.T) {
	t.Parallel()
	units := unitdb.New(database.WoWFlavor{})
	unknown := guid.GUID(0xF130000844003FB5)
	ordinary := unknown + 10
	units.Info[unknown] = unitinfo.Info{Name: "Named but unresolved"}
	finalized := &instances.FinalizedInstance{ // No retained encounters required.
		PersistedUnits: []guid.GUID{ordinary, unknown + 3, unknown + 2, unknown + 1, unknown, unknown, 0},
		UnitCategories: map[guid.GUID]unitdb.Category{unknown: unitdb.CategoryUnknown, ordinary: unitdb.CategoryOrdinary},
	}
	report := buildIdentityInstance("Raid", "Zone", finalized, units, nil)
	require.Equal(t, "Zone", report.Zone)
	require.Len(t, report.Units, 2)
	require.Equal(t, "unknown", report.Units[0].Category)
	require.Equal(t, "Named but unresolved", report.Units[0].Name)
	require.Equal(t, 4, report.Units[0].UniqueCount)
	require.Equal(t, []string{unknown.String(), (unknown + 1).String(), (unknown + 2).String()}, report.Units[0].Samples)
	require.Equal(t, "ordinary", report.Units[1].Category)
	require.Equal(t, uint32(0x844), report.Units[1].EntryID)
	require.Equal(t, report, buildIdentityInstance("Raid", "Zone", finalized, units, nil))
}

func TestIdentityReportPreservesSpellDiagnostics(t *testing.T) {
	t.Parallel()
	cs := &creatures.Creatures{UnitSpells: map[uint32]map[string]struct{}{123: {"Fireball": {}}}}
	report := buildIdentityReport(cs)
	require.Equal(t, []string{"Fireball"}, report.UnitSpells[123])
	require.Empty(t, report.ZonedUnits)
}

func TestIdentityInstancePreservesAllCategories(t *testing.T) {
	t.Parallel()
	categories := []unitdb.Category{unitdb.CategoryUnknown, unitdb.CategoryOrdinary, unitdb.CategoryGuardian, unitdb.CategoryScriptedObject, unitdb.CategoryCritter, unitdb.CategoryTotem, unitdb.CategoryTrap, unitdb.CategoryDemon, unitdb.CategoryPlayer, unitdb.CategoryPet}
	finalized := &instances.FinalizedInstance{UnitCategories: make(map[guid.GUID]unitdb.Category)}
	for i, category := range categories {
		id := guid.GUID(0xF130000844003FB5) + guid.GUID(i)
		finalized.PersistedUnits = append(finalized.PersistedUnits, id)
		finalized.UnitCategories[id] = category
	}
	report := buildIdentityInstance("Raid", "Zone", finalized, unitdb.New(database.WoWFlavor{}), nil)
	require.Len(t, report.Units, len(categories))
	for _, category := range categories {
		found := false
		for _, unit := range report.Units {
			if unit.Category == string(category) {
				found = true
				require.Equal(t, 1, unit.UniqueCount)
			}
		}
		require.True(t, found, "category %s", category)
	}
}

func TestIdentityReportPreservesRegisteredBoss(t *testing.T) {
	t.Parallel()
	id := guid.GUID(0xF130000844003FB5)
	finalized := &instances.FinalizedInstance{PersistedUnits: []guid.GUID{id}, UnitCategories: map[guid.GUID]unitdb.Category{id: unitdb.CategoryOrdinary}}
	idf := identifier.NewIdentifier(map[uint32]identifier.Identity{0x844: {Boss: true}})
	report := buildIdentityInstance("Raid", "Zone", finalized, unitdb.New(database.WoWFlavor{}), idf)
	require.True(t, report.Units[0].Boss)
}
