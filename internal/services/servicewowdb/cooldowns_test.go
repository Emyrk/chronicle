package servicewowdb

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestCooldownSpellsByClassBroadcastsGenericCooldowns(t *testing.T) {
	t.Parallel()

	byClass := cooldownSpellsByClass([]database.ListCooldownSpellsByDatasetRow{
		{
			SpellID:        20554,
			Name:           "Berserking",
			RecoveryTimeMs: 180_000,
			SpellClassSet:  int32(chrondbc.SpellClassSetGeneric),
			DurationMs:     10_000,
		},
	})

	require.Len(t, byClass, len(cooldownPlayerClassSets))
	for _, classSet := range cooldownPlayerClassSets {
		className, ok := cooldownClassName(classSet)
		require.True(t, ok)
		require.Equal(t, []CooldownSpellEntry{{
			ID:             20554,
			Name:           "Berserking",
			CooldownMS:     180_000,
			RecoveryTimeMS: 180_000,
			DurationMS:     10_000,
		}}, byClass[className])
	}
}
