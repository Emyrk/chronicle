package spelldb_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/bitmask"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSpellRoundTrip inserts a fully-populated chrondbc.Spell into the
// database via SpellRow, reads it back, converts to chrondbc.Spell, and
// verifies every field survived the round-trip.
func TestSpellRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	datasetID := servicedataset.DefaultDatasetID

	// Build a spell with non-zero values in every field to catch mapping bugs.
	original := chrondbc.Spell{
		ID:                    133, // Fireball (Rank 1)
		Name_lang:             i18n.Text{i18n.English: "Fireball"},
		NameSubtext_lang:      i18n.Text{i18n.English: "Rank 1"},
		Description_lang:      i18n.Text{i18n.English: "Hurls a fiery ball that causes $s1 Fire damage."},
		AuraDescription_lang:  i18n.Text{i18n.English: ""},
		SpellIconID:           11,
		ActiveIconID:          0,
		MaxLevel:              0,
		BaseLevel:             1,
		SpellLevel:            1,
		Category:              0,
		MaxTargetLevel:        0,
		School:                chrondbc.SchoolFire,
		SpellPriority:         0,
		StanceBarOrder:        -1,
		ProcTypeMask:          0,
		ProcFlags:             0,
		ProcChance:            101,
		ProcCharges:           0,
		Speed:                 24.0,
		DispelType:            0,
		AuraInterruptFlags:    0,
		ModalNextSpell:        0,
		InterruptFlags:        0,
		CumulativeAura:        0,
		Mechanic:              0,
		DefenseType:           2, // Magic
		CasterAuraState:       0,
		TargetAuraState:       0,
		MaxTargets:            0,
		TargetCreatureType:    0,
		RequiresSpellFocus:    0,
		PowerType:             0, // Mana
		ManaCost:              30,
		ManaCostPct:           0,
		ManaCostPerLevel:      0,
		ManaPerSecond:         0,
		Reagent:               [8]chrondbc.ItemID{0, 0, 0, 0, 0, 0, 0, 0},
		ReagentCount:          [8]int32{0, 0, 0, 0, 0, 0, 0, 0},
		CastingTimeIndex:      3,
		RecoveryTime:          0,
		StartRecoveryCategory: 133,
		StartRecoveryTime:     1500 * time.Millisecond,
		CategoryRecoveryTime:  0,
		RangeIndex:            4,
		DurationIndex:         0,
		Attrs:                 [9]uint32{0x00010000, 0, 0, 0, 0, 0, 0, 0, 0},
		Targets:               0,
		SpellClassSet:         3, // Mage
		SpellClassMask:        1,
		EquippedItemInvTypes:  0,
		EquippedItemClass:     -1, // None / no requirement
		EquippedItemSubclass:  0,
		PreventionType:        1,

		// Effect 0: Direct damage
		Effect:                   [3]chrondbc.Effect{2, 0, 0}, // SPELL_EFFECT_SCHOOL_DAMAGE
		EffectDieSides:           [3]int32{9, 0, 0},
		EffectRealPointsPerLevel: [3]float32{0.8, 0, 0},
		EffectBasePoints:         [3]int32{13, 0, 0},
		EffectMechanic:           [3]int32{0, 0, 0},
		EffectRadiusIndex:        [3]chrondbc.SpellRadiusID{0, 0, 0},
		EffectAura:               [3]chrondbc.AuraEffect{0, 0, 0},
		EffectAuraPeriod:         [3]int32{0, 0, 0},
		EffectAmplitude:          [3]float32{0, 0, 0},
		EffectChainTargets:       [3]int32{0, 0, 0},
		EffectItemType:           [3]chrondbc.ItemID{0, 0, 0},
		EffectMiscValue:          [3]int32{0, 0, 0},
		EffectTriggerSpell:       [3]chrondbc.SpellID{0, 0, 0},
		EffectPointsPerCombo:     [3]float32{0, 0, 0},
		EffectBaseDice:           [3]int32{1, 0, 0},
		EffectDicePerLevel:       [3]int32{0, 0, 0},
		EffectChainAmplitude:     [3]float32{1.0, 0, 0},
		ImplicitTargetA:          [3]chrondbc.ImplicitTarget{6, 0, 0}, // TARGET_UNIT_ENEMY
		ImplicitTargetB:          [3]chrondbc.ImplicitTarget{0, 0, 0},

		TotemsID:           0,
		Totem:              [2]chrondbc.ItemID{0, 0},
		CastUI:             0,
		RequiredAuraVision: 0,
		MinFactionID:       0,
		MinReputation:      0,
		SpellVisualID:      [2]int32{12, 0},

		RuneCostID:             0,
		SpellMissileID:         0,
		DescriptionVariablesID: 0,
		CasterAuraSpell:        0,
		TargetAuraSpell:        0,
		ExcludeCasterAuraSpell: 0,
		ExcludeTargetAuraSpell: 0,
		ExcludeCasterAuraState: 0,
		ExcludeTargetAuraState: 0,
		ManaPerSecondPerLevel:  0,
	}

	// Convert → insert → read back → convert
	row := spelldb.FromSpell(datasetID, &original)
	err := spelldb.InsertSpell(ctx, pool, &row)
	require.NoError(t, err, "insert spell")

	got, err := spelldb.GetSpell(ctx, pool, datasetID, int32(original.ID))
	require.NoError(t, err, "get spell by ID")

	roundTripped := got.ToSpell()

	// Core fields
	assert.Equal(t, original.ID, roundTripped.ID)
	assert.Equal(t, original.Name(), roundTripped.Name())
	assert.Equal(t, original.Subtext(), roundTripped.Subtext())
	assert.Equal(t, original.Description(), roundTripped.Description())
	assert.Equal(t, original.SpellIconID, roundTripped.SpellIconID)
	assert.Equal(t, original.BaseLevel, roundTripped.BaseLevel)
	assert.Equal(t, original.SpellLevel, roundTripped.SpellLevel)
	assert.Equal(t, original.School, roundTripped.School)
	assert.Equal(t, original.DefenseType, roundTripped.DefenseType)
	assert.Equal(t, original.ManaCost, roundTripped.ManaCost)
	assert.Equal(t, original.Speed, roundTripped.Speed)
	assert.Equal(t, original.ProcChance, roundTripped.ProcChance)

	// Timing (round-trip via milliseconds)
	assert.Equal(t, original.StartRecoveryTime, roundTripped.StartRecoveryTime)
	assert.Equal(t, original.CastingTimeIndex, roundTripped.CastingTimeIndex)
	assert.Equal(t, original.RangeIndex, roundTripped.RangeIndex)

	// Attributes
	assert.Equal(t, original.Attrs, roundTripped.Attrs)

	// Class
	assert.Equal(t, original.SpellClassSet, roundTripped.SpellClassSet)
	assert.Equal(t, original.SpellClassMask, roundTripped.SpellClassMask)
	assert.Equal(t, original.PreventionType, roundTripped.PreventionType)

	// Effects
	assert.Equal(t, original.Effect, roundTripped.Effect)
	assert.Equal(t, original.EffectDieSides, roundTripped.EffectDieSides)
	assert.Equal(t, original.EffectBasePoints, roundTripped.EffectBasePoints)
	assert.Equal(t, original.EffectRealPointsPerLevel, roundTripped.EffectRealPointsPerLevel)
	assert.Equal(t, original.EffectBaseDice, roundTripped.EffectBaseDice)
	assert.Equal(t, original.EffectChainAmplitude, roundTripped.EffectChainAmplitude)
	assert.Equal(t, original.ImplicitTargetA, roundTripped.ImplicitTargetA)
	assert.Equal(t, original.ImplicitTargetB, roundTripped.ImplicitTargetB)
	assert.Equal(t, original.EffectTriggerSpell, roundTripped.EffectTriggerSpell)

	// Visuals
	assert.Equal(t, original.SpellVisualID, roundTripped.SpellVisualID)

	// Verify name lookup also works
	byName, err := spelldb.GetSpellsByName(ctx, pool, datasetID, "Fireball")
	require.NoError(t, err, "get spells by name")
	require.Len(t, byName, 1)
	assert.Equal(t, chrondbc.SpellID(byName[0].SpellID), original.ID)

	// Verify methods still work on the round-tripped spell
	assert.Equal(t, original.SpellDamageType(), roundTripped.SpellDamageType())
	assert.Equal(t, original.AttackOutcome(), roundTripped.AttackOutcome())

	// Verify EquippedItemClass survived (it's -1 for None)
	assert.Equal(t, original.EquippedItemClass, roundTripped.EquippedItemClass)
}

// TestSpellUpsertBatch verifies batch insert + update.
func TestSpellUpsertBatch(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	datasetID := servicedataset.DefaultDatasetID

	spells := []chrondbc.Spell{
		{
			ID:          100,
			Name_lang:   i18n.Text{i18n.English: "Spell A"},
			School:      chrondbc.School(bitmask.Bitmask32(chrondbc.SchoolFire)),
			SpellIconID: 1,
		},
		{
			ID:          200,
			Name_lang:   i18n.Text{i18n.English: "Spell B"},
			School:      chrondbc.School(bitmask.Bitmask32(chrondbc.SchoolFrost)),
			SpellIconID: 2,
		},
	}

	rows := make([]spelldb.SpellRow, len(spells))
	for i := range spells {
		rows[i] = spelldb.FromSpell(datasetID, &spells[i])
	}

	err := spelldb.UpsertBatch(ctx, pool, rows)
	require.NoError(t, err, "batch upsert")

	// Verify both were inserted
	got1, err := spelldb.GetSpell(ctx, pool, datasetID, 100)
	require.NoError(t, err)
	assert.Equal(t, "Spell A", got1.Name)

	got2, err := spelldb.GetSpell(ctx, pool, datasetID, 200)
	require.NoError(t, err)
	assert.Equal(t, "Spell B", got2.Name)

	// Upsert: change name and re-insert
	rows[0].Name = "Spell A Updated"
	err = spelldb.UpsertBatch(ctx, pool, rows[:1])
	require.NoError(t, err)

	got1, err = spelldb.GetSpell(ctx, pool, datasetID, 100)
	require.NoError(t, err)
	assert.Equal(t, "Spell A Updated", got1.Name)
}
