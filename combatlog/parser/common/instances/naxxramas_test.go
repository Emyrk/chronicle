package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestNaxxramasThaddiusUnitClassification(t *testing.T) {
	t.Parallel()

	hostiles := NaxxramasHostiles(database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle})

	feugen := hostiles[15930]
	require.Equal(t, "Feugen", feugen.Name)
	require.False(t, feugen.Boss)
	require.Empty(t, feugen.EncounterName)

	stalagg := hostiles[15929]
	require.Equal(t, "Stalagg", stalagg.Name)
	require.False(t, stalagg.Boss)
	require.Empty(t, stalagg.EncounterName)

	thaddius := hostiles[15928]
	require.Equal(t, "Thaddius", thaddius.Name)
	require.True(t, thaddius.Boss)
	require.Equal(t, "Thaddius", thaddius.EncounterName)
	require.Equal(t, types.AffiliationHostile, thaddius.Affiliation)
}

func TestNaxxramasThaddiusSpeedrunRequirementCategories(t *testing.T) {
	t.Parallel()

	categories := make(map[uint32]rankings.SpeedrunRequirementCategory)
	for _, requirement := range NaxxramasSpeedrunRequirements() {
		for _, entryID := range requirement.EntryIDs {
			categories[entryID] = requirement.Category
		}
	}

	require.Equal(t, rankings.SpeedrunCategoryTrash, categories[15930])  // Feugen
	require.Equal(t, rankings.SpeedrunCategoryTrash, categories[15929])  // Stalagg
	require.Equal(t, rankings.SpeedrunCategoryBosses, categories[15928]) // Thaddius
}
