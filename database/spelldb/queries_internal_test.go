package spelldb

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSpellRowValuesUseEmptyArraysForNilSlices(t *testing.T) {
	t.Parallel()

	values := (&SpellRow{}).values()
	for _, column := range []string{"reagent", "reagent_count", "attributes", "totem", "spell_visual_id"} {
		index := -1
		for i, candidate := range columns {
			if candidate == column {
				index = i
				break
			}
		}
		require.NotEqual(t, -1, index, "column %q must exist", column)
		require.Equal(t, []int32{}, values[index], "column %q must not be sent to PostgreSQL as NULL", column)
	}
}
