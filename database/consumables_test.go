package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
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

	insertLearnSpell := func(datasetID string, rootID, taughtID int32, taughtName string) {
		t.Helper()
		root := chrondbc.Spell{
			ID:        chrondbc.SpellID(rootID),
			Name_lang: i18n.Text{i18n.English: "Teach " + taughtName},
		}
		root.Effect[0] = chrondbc.EffectLearnSpell
		root.EffectTriggerSpell[0] = chrondbc.SpellID(taughtID)

		taught := chrondbc.Spell{
			ID:        chrondbc.SpellID(taughtID),
			Name_lang: i18n.Text{i18n.English: taughtName},
		}
		taught.Effect[0] = chrondbc.EffectApplyAura

		rows := []spelldb.SpellRow{
			spelldb.FromSpell(uuid.MustParse(datasetID), &root),
			spelldb.FromSpell(uuid.MustParse(datasetID), &taught),
		}
		require.NoError(t, spelldb.UpsertBatch(ctx, pool, rows))
	}

	insertMountSpell := func(datasetID string, spellID int32, name string) {
		t.Helper()
		mount := chrondbc.Spell{
			ID:        chrondbc.SpellID(spellID),
			Name_lang: i18n.Text{i18n.English: name},
		}
		mount.Effect[0] = chrondbc.EffectApplyAura
		mount.EffectAura[0] = chrondbc.AuraEffectMounted
		require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
			spelldb.FromSpell(uuid.MustParse(datasetID), &mount),
		}))
	}

	defaultID := servicedataset.DefaultDatasetID.String()
	otherID := otherDataset.ID.String()
	insertItem(defaultID, 1000, int32(chrondbc.ItemClassConsumable), 100, "Default Elixir")
	insertItem(defaultID, 1001, int32(chrondbc.ItemClassWeapon), 100, "Not a Consumable")
	insertItem(otherID, 1000, int32(chrondbc.ItemClassConsumable), 300, "Other Elixir")
	insertSpells(defaultID, 100, 200, "Default Buff")
	insertSpells(otherID, 300, 400, "Other Buff")
	insertLearnSpell(defaultID, 600, 601, "Prayer of Shadow Protection")

	insertMountSpell(defaultID, 700, "Brown Horse")

	// Some physical consumables, such as Jujus, are classified as quest
	// items. Include stackable, non-equippable on-use items, charged trade goods
	// such as weapon oils, and non-stackable items whose use spell directly
	// applies an aura. Exclude reusable equipment, non-stackable quest activators,
	// non-use item triggers, and on-use codices whose root spell teaches a class
	// spell instead of applying a consumable effect.
	_, err = pool.Exec(ctx, `
		INSERT INTO world_item_template (
			dataset_id, entry, class, name, inventory_type, stackable,
			spellid_1, spelltrigger_1, spellcharges_1, spellid_2, spelltrigger_2
		) VALUES
			($1, 1002, $2, 'Quest-class Consumable', 0, 20, 100, 0, 0, 999, 1),
			($1, 1003, $3, 'Reusable Trinket', 12, 1, 100, 0, 0, 0, 0),
			($1, 1004, $2, 'Quest Activator', 0, 1, 100, 0, 0, 0, 0),
			($1, 1005, $2, 'Triggered Quest Item', 0, 20, 100, 1, 0, 0, 0),
			($1, 1006, $2, 'Non-stackable Consumable', 0, 1, 200, 0, 0, 0, 0),
			($1, 1007, $4, 'Wizard Oil', 0, 1, 500, 0, -5, 0, 0),
			($1, 1008, $4, 'Dense Sharpening Stone', 0, 20, 501, 0, -1, 0, 0),
			-- Real codices list both the learn wrapper and the taught spell as on-use slots.
			($1, 1009, $5, 'Class Spell Codex', 0, 1, 600, 0, 0, 601, 0),
			($1, 1010, $2, 'Reusable Mount', 0, 1, 700, 0, 0, 0, 0)
	`, defaultID, int32(chrondbc.ItemClassQuest), int32(chrondbc.ItemClassArmor), int32(chrondbc.ItemClassTradeGoods), int32(chrondbc.ItemClassRecipe))
	require.NoError(t, err)

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
	require.Len(t, defaultRows, 5)
	assert.Equal(t, int32(1000), defaultRows[0].ItemID)
	assert.Equal(t, "Default Elixir", defaultRows[0].ItemName)
	assert.Equal(t, []int32{100}, defaultRows[0].ItemSpellIds)
	require.True(t, defaultRows[0].BuffSpellID.Valid)
	assert.Equal(t, int32(200), defaultRows[0].BuffSpellID.Int32)
	assert.Equal(t, "Default Buff", defaultRows[0].BuffSpellName.String)
	assert.Equal(t, int32(1008), defaultRows[1].ItemID)
	assert.Equal(t, "Dense Sharpening Stone", defaultRows[1].ItemName)
	assert.Equal(t, []int32{501}, defaultRows[1].ItemSpellIds)
	assert.False(t, defaultRows[1].BuffSpellID.Valid)
	assert.Equal(t, int32(1006), defaultRows[2].ItemID)
	assert.Equal(t, "Non-stackable Consumable", defaultRows[2].ItemName)
	assert.Equal(t, []int32{200}, defaultRows[2].ItemSpellIds)
	assert.Equal(t, int32(200), defaultRows[2].BuffSpellID.Int32)
	assert.Equal(t, int32(1002), defaultRows[3].ItemID)
	assert.Equal(t, "Quest-class Consumable", defaultRows[3].ItemName)
	assert.Equal(t, []int32{100}, defaultRows[3].ItemSpellIds)
	assert.Equal(t, int32(200), defaultRows[3].BuffSpellID.Int32)
	assert.Equal(t, int32(1007), defaultRows[4].ItemID)
	assert.Equal(t, "Wizard Oil", defaultRows[4].ItemName)
	assert.Equal(t, []int32{500}, defaultRows[4].ItemSpellIds)
	assert.False(t, defaultRows[4].BuffSpellID.Valid)

	defaultSummary, err := store.GetDatasetImportSummary(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	assert.Equal(t, int32(5), defaultSummary.ConsumablesCount)

	otherRows, err := store.ListConsumablesByDataset(ctx, otherDataset.ID)
	require.NoError(t, err)
	require.Len(t, otherRows, 1)
	assert.Equal(t, "Other Elixir", otherRows[0].ItemName)
	assert.Equal(t, int32(400), otherRows[0].BuffSpellID.Int32)

	canonical, err := store.UpsertConsumableDisambiguationIfCandidate(ctx, database.UpsertConsumableDisambiguationIfCandidateParams{
		DatasetID:  servicedataset.DefaultDatasetID,
		EffectKind: "buff",
		SpellID:    200,
		ItemID:     pgtype.Int4{Int32: 1000, Valid: true},
	})
	require.NoError(t, err)
	assert.Equal(t, int32(1000), canonical.ItemID.Int32)

	runtimeMappings, err := store.ListConsumableDisambiguationsByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Len(t, runtimeMappings, 1)
	assert.Equal(t, int32(1000), runtimeMappings[0].ItemID.Int32)

	ignored, err := store.IgnoreConsumableEffectIfCandidate(ctx, database.IgnoreConsumableEffectIfCandidateParams{
		DatasetID:  servicedataset.DefaultDatasetID,
		EffectKind: "buff",
		SpellID:    200,
	})
	require.NoError(t, err)
	assert.True(t, ignored.Ignored)

	policies, err := store.ListConsumableEffectPoliciesByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Len(t, policies, 1)
	assert.True(t, policies[0].Ignored)
	assert.False(t, policies[0].ItemID.Valid)

	runtimeMappings, err = store.ListConsumableDisambiguationsByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	assert.Empty(t, runtimeMappings)

	require.NoError(t, store.DeleteConsumableDisambiguation(ctx, database.DeleteConsumableDisambiguationParams{
		DatasetID:  servicedataset.DefaultDatasetID,
		EffectKind: "buff",
		SpellID:    200,
	}))
	policies, err = store.ListConsumableEffectPoliciesByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	assert.Empty(t, policies)

	otherSummary, err := store.GetDatasetImportSummary(ctx, otherDataset.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), otherSummary.ConsumablesCount)
}
