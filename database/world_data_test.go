package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestSearchSlotEnchantmentsUsesCanonicalEffects(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	datasetID := servicedataset.DefaultDatasetID

	const headMask int32 = 1 << 1
	spell := func(id chrondbc.SpellID) chrondbc.Spell {
		return chrondbc.Spell{
			ID:                   id,
			EquippedItemClass:    4,
			EquippedItemInvTypes: chrondbc.EquippedItemInvTypes(headMask),
		}
	}
	canonical := spell(910001)
	nondefault := spell(910002)
	wideOnly := spell(910003)
	wideOnly.Effects = []chrondbc.SpellEffect{{
		EffectIndex:     0,
		Effect:          53,
		EffectMiscValue: []int32{1003},
	}}
	require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
		spelldb.FromSpell(datasetID, &canonical),
		spelldb.FromSpell(datasetID, &nondefault),
		spelldb.FromSpell(datasetID, &wideOnly),
	}))

	_, err := pool.Exec(ctx, `
		INSERT INTO dbc_spell_item_enchantment(dataset_id, id, name_lang)
		VALUES
			($1, 1001, 'Canonical High Index'),
			($1, 1002, 'Nondefault Difficulty'),
			($1, 1003, 'Wide Only')
	`, datasetID)
	require.NoError(t, err)

	effects := []database.CopyLegacySpellEffectsParams{
		spellEffectRow(datasetID, 910001, 0, 5, 0, 53, []int32{999, 1001}),
		spellEffectRow(datasetID, 910001, 0, 6, 1, 53, []int32{1001}),
		spellEffectRow(datasetID, 910002, 2, 0, 0, 53, []int32{1002}),
	}
	var batchErr error
	store.CopyLegacySpellEffects(ctx, effects).Exec(func(_ int, err error) {
		if batchErr == nil && err != nil {
			batchErr = err
		}
	})
	require.NoError(t, batchErr)

	rows, err := store.SearchSlotEnchantments(ctx, database.SearchSlotEnchantmentsParams{
		DatasetID:  datasetID,
		SearchTerm: "",
		InvMask:    headMask,
	})
	require.NoError(t, err)
	require.Equal(t, []database.SearchSlotEnchantmentsRow{{
		ID:       1001,
		NameLang: "Canonical High Index",
	}}, rows)
}

func TestGetItemTemplateMetadataBatchExecutes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	rows, err := db.GetItemTemplateMetadataBatch(ctx, database.GetItemTemplateMetadataBatchParams{
		DatasetID: servicedataset.DefaultDatasetID,
		ItemIds:   []int32{-1},
		ItemNames: []string{"missing test item"},
	})
	require.NoError(t, err)
	require.Empty(t, rows)
}

func spellEffectRow(datasetID [16]byte, spellID, difficultyID, effectIndex, sourceID, effect int32, misc []int32) database.CopyLegacySpellEffectsParams {
	return database.CopyLegacySpellEffectsParams{
		DatasetID:            datasetID,
		SpellID:              spellID,
		DifficultyID:         difficultyID,
		EffectIndex:          effectIndex,
		SourceID:             sourceID,
		Effect:               effect,
		EffectBasePointsF:    1,
		EffectMiscValue:      misc,
		EffectRadiusIndex:    []int32{},
		EffectSpellClassMask: []int32{},
		ImplicitTarget:       []int32{},
	}
}
