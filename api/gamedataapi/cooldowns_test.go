package gamedataapi

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCooldownSpellFromSpell(t *testing.T) {
	t.Parallel()

	spell := func(classSet chrondbc.SpellClassSet, recovery, category time.Duration) *chrondbc.Spell {
		return &chrondbc.Spell{
			ID:                   871,
			Name_lang:            i18n.Text{i18n.English: "Shield Wall"},
			NameSubtext_lang:     i18n.Text{i18n.English: "Rank 1"},
			SpellClassSet:        classSet,
			RecoveryTime:         recovery,
			CategoryRecoveryTime: category,
		}
	}

	t.Run("individual cooldown", func(t *testing.T) {
		row, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSetWarrior, 30*time.Minute, 0))
		require.True(t, ok)
		assert.Equal(t, int32(871), row.SpellID)
		assert.Equal(t, "Shield Wall", row.Name)
		assert.Equal(t, "Rank 1", row.NameSubtext)
		assert.Equal(t, int64(1_800_000), row.RecoveryTimeMS)
		assert.Zero(t, row.CategoryRecoveryTimeMS)
		assert.Equal(t, int32(chrondbc.SpellClassSetWarrior), row.SpellClassSet)
	})

	t.Run("shared category cooldown", func(t *testing.T) {
		row, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSetMage, 0, 45*time.Second))
		require.True(t, ok)
		assert.Zero(t, row.RecoveryTimeMS)
		assert.Equal(t, int64(45_000), row.CategoryRecoveryTimeMS)
	})

	t.Run("short individual cooldown", func(t *testing.T) {
		row, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSetRogue, 6*time.Second, 0))
		require.True(t, ok)
		assert.Equal(t, int64(6_000), row.RecoveryTimeMS)
	})

	t.Run("no cooldown", func(t *testing.T) {
		_, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSetRogue, 0, 0))
		assert.False(t, ok)
	})

	t.Run("generic spell", func(t *testing.T) {
		_, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSetGeneric, time.Minute, 0))
		assert.False(t, ok)
	})

	t.Run("unknown class set", func(t *testing.T) {
		_, ok := cooldownSpellFromSpell(spell(chrondbc.SpellClassSet1, time.Minute, 0))
		assert.False(t, ok)
	})

	t.Run("passive spell", func(t *testing.T) {
		passive := spell(chrondbc.SpellClassSetWarrior, time.Minute, 0)
		passive.Attrs.Set(chrondbc.Attr_Passive)
		_, ok := cooldownSpellFromSpell(passive)
		assert.False(t, ok)
	})
}
