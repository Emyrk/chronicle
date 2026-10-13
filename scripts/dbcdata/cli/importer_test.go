package cli

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSpellCompanionImportersPrecedeSpells(t *testing.T) {
	t.Parallel()

	spellIndex := -1
	indexes := make(map[string]int)
	for i, importer := range Registry() {
		indexes[importer.Key()] = i
		if importer.Key() == "spells" {
			spellIndex = i
		}
	}
	require.NotEqual(t, -1, spellIndex, "missing spells importer")

	for _, key := range []string{
		"spell-cast-times",
		"spell-durations",
		"spell-ranges",
		"spell-icons",
		"spell-categories",
		"spell-radii",
		"spell-focus-objects",
		"spell-desc-vars",
	} {
		index, ok := indexes[key]
		require.True(t, ok, "missing importer %q", key)
		require.Less(t, index, spellIndex, "%s must upload before Spell.dbc", key)
	}
}
