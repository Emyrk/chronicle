package gamedataapi

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVulnerabilitySpellFromSpell(t *testing.T) {
	t.Parallel()

	spell := func(id chrondbc.SpellID, aura chrondbc.AuraEffect, basePoints, schoolMask int32) *chrondbc.Spell {
		return &chrondbc.Spell{
			ID:               id,
			Name_lang:        i18n.Text{i18n.English: "Vulnerability"},
			Effect:           [3]chrondbc.Effect{chrondbc.EffectApplyAura},
			EffectAura:       [3]chrondbc.AuraEffect{aura},
			EffectBasePoints: [3]int32{basePoints},
			EffectMiscValue:  [3]int32{schoolMask},
		}
	}

	t.Run("percent damage taken", func(t *testing.T) {
		row, ok := vulnerabilitySpellFromSpell(spell(1490, chrondbc.AuraEffectModDamagePercentTaken, 9, 124))
		require.True(t, ok)
		assert.Equal(t, int32(1490), row.SpellID)
		assert.Equal(t, "Vulnerability", row.Name)
		assert.Equal(t, int32(124), row.SchoolBitmask)
		require.NotNil(t, row.PercentAffect)
		assert.Equal(t, int32(10), *row.PercentAffect)
		assert.Nil(t, row.FlatAffect)
	})

	t.Run("flat damage taken", func(t *testing.T) {
		row, ok := vulnerabilitySpellFromSpell(spell(11374, chrondbc.AuraEffectModDamageTaken, 7, 1))
		require.True(t, ok)
		require.NotNil(t, row.FlatAffect)
		assert.Equal(t, int32(8), *row.FlatAffect)
		assert.Nil(t, row.PercentAffect)
	})

	t.Run("ebon plague dummy aura", func(t *testing.T) {
		row, ok := vulnerabilitySpellFromSpell(spell(51726, chrondbc.AuraEffectDummy, 12, 126))
		require.True(t, ok)
		require.NotNil(t, row.PercentAffect)
		assert.Equal(t, int32(13), *row.PercentAffect)
	})

	t.Run("unrelated dummy aura", func(t *testing.T) {
		_, ok := vulnerabilitySpellFromSpell(spell(12345, chrondbc.AuraEffectDummy, 12, 126))
		assert.False(t, ok)
	})

	t.Run("zero base points", func(t *testing.T) {
		_, ok := vulnerabilitySpellFromSpell(spell(1490, chrondbc.AuraEffectModDamagePercentTaken, 0, 124))
		assert.False(t, ok)
	})
}

func TestVulnerabilitySpellsDatasetQuery(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Vulnerability Query",
		Slug:          "vulnerability-query",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_vulnerability_spells (
			dataset_id, spell_id, name, school_bitmask, percent_affect, flat_affect
		) VALUES
			($1, 1490, 'Curse of Elements', 124, 10, NULL),
			($1, 11374, 'Gift of Arthas', 1, NULL, 8)
	`, dataset.ID)
	require.NoError(t, err)

	rows, err := store.ListVulnerabilitySpellsByDataset(ctx, database.ListVulnerabilitySpellsByDatasetParams{
		DatasetID: dataset.ID,
		SpellIds:  []int32{},
	})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.Equal(t, int32(1490), rows[0].SpellID)
	assert.True(t, rows[0].PercentAffect.Valid)
	assert.False(t, rows[0].FlatAffect.Valid)
	assert.Equal(t, int32(11374), rows[1].SpellID)
	assert.False(t, rows[1].PercentAffect.Valid)
	assert.True(t, rows[1].FlatAffect.Valid)

	rows, err = store.ListVulnerabilitySpellsByDataset(ctx, database.ListVulnerabilitySpellsByDatasetParams{
		DatasetID: dataset.ID,
		SpellIds:  []int32{11374},
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, int32(11374), rows[0].SpellID)

	summary, err := store.GetDatasetImportSummary(ctx, dataset.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(2), summary.VulnerabilitySpellsCount)
}
