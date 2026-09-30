package spelldb

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteColumnsExcludeCompatibilityProjections(t *testing.T) {
	t.Parallel()

	for _, column := range writeColumns {
		_, compatibilityOnly := compatibilityOnlyColumns[column]
		require.False(t, compatibilityOnly, "write column %q must not be a compatibility projection", column)
	}
	require.Len(t, (&SpellRow{}).writeValues(), len(writeColumns))
	require.Equal(t, len(columns)-len(compatibilityOnlyColumns), len(writeColumns))
}

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

func TestSpellRowValuesUseEmptyFloatArrayForNilModernBasePoints(t *testing.T) {
	t.Parallel()

	values := (&SpellRow{}).values()
	index := -1
	for i, column := range columns {
		if column == "effect_base_points_f" {
			index = i
			break
		}
	}
	require.NotEqual(t, -1, index)
	require.Equal(t, []float32{}, values[index])
}
