package chrondbc

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDurationModifiersForSpellAndMaxAuraDuration(t *testing.T) {
	t.Parallel()

	spell := &Spell{
		Duration:       dbcmem.SpellDuration{MaxDuration: 10_000},
		SpellClassSet:  8,
		SpellClassMask: 0b11,
	}
	mods := &DurationModifierSet{
		ByID: map[int32]dbcmem.DurationModifier{
			1: {SpellID: 1, Name: "Improved Duration", Percent: 10},
			2: {SpellID: 2, Name: "Improved Duration", Percent: 20},
			3: {SpellID: 3, Name: "Extended Duration", Flat: 2_000},
			4: {SpellID: 4, Name: "Deprecated Duration", Percent: 50, Deprecated: true},
		},
		ByClassBit: map[int32]map[uint64][]int32{
			8: {
				0b01: {1, 2, 4},
				0b10: {1, 3},
			},
		},
	}

	matched := DurationModifiersForSpell(spell, mods)
	require.Len(t, matched, 4)
	assert.ElementsMatch(t, []int32{1, 2, 3, 4}, []int32{
		matched[0].SpellID,
		matched[1].SpellID,
		matched[2].SpellID,
		matched[3].SpellID,
	})
	assert.Equal(t, 14_400*time.Millisecond, MaxAuraDuration(spell, mods))
}

func TestMaxAuraDurationWithoutModifiers(t *testing.T) {
	t.Parallel()

	spell := &Spell{Duration: dbcmem.SpellDuration{MaxDuration: 10_000}}
	assert.Equal(t, 10*time.Second, MaxAuraDuration(spell, nil))
}
