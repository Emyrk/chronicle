package database_test

import (
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDerivedConsumablesAreDatasetScopedAndLinkBuffs(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	otherDataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Other",
		Slug:          "other-consumables",
		WowVersion:    "1.12",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	insertItem := func(datasetID string, itemID, class, spellID int32, name string) {
		t.Helper()
		_, err := pool.Exec(ctx, `
			INSERT INTO world_item_template (dataset_id, entry, class, name, spellid_1)
			VALUES ($1, $2, $3, $4, $5)
		`, datasetID, itemID, class, name, spellID)
		require.NoError(t, err)
	}

	insertSpells := func(datasetID string, rootID, buffID int32, buffName string) {
		t.Helper()
		root := chrondbc.Spell{
			ID:        chrondbc.SpellID(rootID),
			Name_lang: i18n.Text{i18n.English: "Use " + buffName},
		}
		root.Effect[0] = chrondbc.EffectTriggerSpell
		root.EffectTriggerSpell[0] = chrondbc.SpellID(buffID)

		buff := chrondbc.Spell{
			ID:        chrondbc.SpellID(buffID),
			Name_lang: i18n.Text{i18n.English: buffName},
		}
		buff.Effect[0] = chrondbc.EffectApplyAura
		// Add a cycle to prove recursive generation terminates safely.
		buff.Effect[1] = chrondbc.EffectTriggerSpell
		buff.EffectTriggerSpell[1] = chrondbc.SpellID(rootID)

		rows := []spelldb.SpellRow{
			spelldb.FromSpell(uuid.MustParse(datasetID), &root),
			spelldb.FromSpell(uuid.MustParse(datasetID), &buff),
		}
		require.NoError(t, spelldb.UpsertBatch(ctx, pool, rows))
	}

	defaultID := servicedataset.DefaultDatasetID.String()
	otherID := otherDataset.ID.String()
	insertItem(defaultID, 1000, int32(chrondbc.ItemClassConsumable), 100, "Default Elixir")
	insertItem(defaultID, 1001, int32(chrondbc.ItemClassWeapon), 100, "Not a Consumable")
	insertItem(otherID, 1000, int32(chrondbc.ItemClassConsumable), 300, "Other Elixir")
	insertSpells(defaultID, 100, 200, "Default Buff")
	insertSpells(otherID, 300, 400, "Other Buff")

	refresh := func(datasetID string) {
		t.Helper()
		id := uuid.MustParse(datasetID)
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if err := tx.DeleteConsumablesByDataset(ctx, id); err != nil {
				return err
			}
			if _, err := tx.InsertDerivedConsumables(ctx, id); err != nil {
				return err
			}
			_, err := tx.InsertDerivedConsumableBuffs(ctx, id)
			return err
		}, nil))
	}
	refresh(defaultID)
	refresh(otherID)

	defaultRows, err := store.ListConsumablesByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Len(t, defaultRows, 1)
	assert.Equal(t, int32(1000), defaultRows[0].ItemID)
	assert.Equal(t, "Default Elixir", defaultRows[0].ItemName)
	assert.Equal(t, []int32{100}, defaultRows[0].ItemSpellIds)
	require.True(t, defaultRows[0].BuffSpellID.Valid)
	assert.Equal(t, int32(200), defaultRows[0].BuffSpellID.Int32)
	assert.Equal(t, "Default Buff", defaultRows[0].BuffSpellName.String)

	defaultSummary, err := store.GetDatasetImportSummary(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), defaultSummary.ConsumablesCount)

	otherRows, err := store.ListConsumablesByDataset(ctx, otherDataset.ID)
	require.NoError(t, err)
	require.Len(t, otherRows, 1)
	assert.Equal(t, "Other Elixir", otherRows[0].ItemName)
	assert.Equal(t, int32(400), otherRows[0].BuffSpellID.Int32)

	otherSummary, err := store.GetDatasetImportSummary(ctx, otherDataset.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), otherSummary.ConsumablesCount)
}

func TestBackfillDerivedConsumablesMigrationPopulatesExistingDataset(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	datasetID := servicedataset.DefaultDatasetID

	_, err := pool.Exec(ctx, `
		INSERT INTO world_item_template (dataset_id, entry, class, name, spellid_1)
		VALUES ($1, 6149, $2, 'Greater Mana Potion', 11903)
	`, datasetID, int32(chrondbc.ItemClassConsumable))
	require.NoError(t, err)

	root := chrondbc.Spell{
		ID:        chrondbc.SpellID(11903),
		Name_lang: i18n.Text{i18n.English: "Restore Mana"},
	}
	root.Effect[0] = chrondbc.EffectTriggerSpell
	root.EffectTriggerSpell[0] = chrondbc.SpellID(17531)
	buff := chrondbc.Spell{
		ID:        chrondbc.SpellID(17531),
		Name_lang: i18n.Text{i18n.English: "Mana Potion"},
	}
	buff.Effect[0] = chrondbc.EffectApplyAura
	require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
		spelldb.FromSpell(datasetID, &root),
		spelldb.FromSpell(datasetID, &buff),
	}))

	before, err := store.ListConsumablesByDataset(ctx, datasetID)
	require.NoError(t, err)
	require.Empty(t, before)

	migration, err := os.ReadFile("migrations/000155_backfill_derived_consumables.up.sql")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, string(migration))
	require.NoError(t, err)

	after, err := store.ListConsumablesByDataset(ctx, datasetID)
	require.NoError(t, err)
	require.Len(t, after, 1)
	assert.Equal(t, int32(6149), after[0].ItemID)
	require.True(t, after[0].BuffSpellID.Valid)
	assert.Equal(t, int32(17531), after[0].BuffSpellID.Int32)
}
