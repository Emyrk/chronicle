package gamedataapi

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/testutil"
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

func TestCooldownDatasetImportSummary(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Cooldown Summary",
		Slug:          "cooldown-summary",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_cooldown_spells (
			dataset_id, spell_id, name, recovery_time_ms, spell_class_set
		) VALUES ($1, 871, 'Shield Wall', 1800000, 4)
	`, dataset.ID)
	require.NoError(t, err)

	summary, err := store.GetDatasetImportSummary(ctx, dataset.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), summary.CooldownsCount)
}
