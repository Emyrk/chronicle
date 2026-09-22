package chrondbc

import (
	"bytes"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/Gophercraft/core/vsn"
	"github.com/stretchr/testify/require"
)

func TestLegacySpellEffectsFixtureParity(t *testing.T) {
	fixtures := []struct {
		name  string
		build vsn.Build
	}{
		{name: "ascension", build: dbcdb.ExtendedSpellBuild},
		{name: "azerothcore", build: dbcdb.ExtendedSpellBuild},
		{name: "epoch", build: vsn.V3_3_5a},
		{name: "kronos", build: vsn.V1_12_1},
		{name: "octowow", build: vsn.V1_12_1},
		{name: "turtle", build: vsn.V1_12_1},
		{name: "vanillaplus", build: vsn.V1_12_1},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			assertLegacySpellEffectsFixtureParity(t, fixture.name, fixture.build)
		})
	}
}

func intAt(values []int32, index int) int32 {
	if index < len(values) {
		return values[index]
	}
	return 0
}

func floatAt(values []float32, index int) float32 {
	if index < len(values) {
		return values[index]
	}
	return 0
}

func assertLegacySpellEffectsFixtureParity(t *testing.T, fixture string, build vsn.Build) {
	t.Helper()
	data, err := os.ReadFile("../../../assets/" + fixture + "/Spell.dbc")
	require.NoError(t, err)
	table, err := dbc.NewDB(build).Open("Spell", bytes.NewReader(data))
	require.NoError(t, err)

	raw := dbcdb.WrapTable[dbdefs.Ent_Spell](table)
	converted := NewSpells(table)
	require.Equal(t, raw.Len(), converted.Len())
	for row := 0; row < raw.Len(); row++ {
		def, err := raw.Index(row)
		require.NoError(t, err)
		spell, err := converted.Index(row)
		require.NoError(t, err)
		require.Len(t, spell.Effects, 3, "spell %d", spell.ID)
		for i := 0; i < 3; i++ {
			effect := spell.Effects[i]
			require.Equal(t, int32(i), effect.EffectIndex, "spell %d", spell.ID)
			require.Equal(t, Effect(intAt(def.Effect, i)), effect.Effect, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectDieSides, i), effect.EffectDieSides, "spell %d effect %d", spell.ID, i)
			require.Equal(t, floatAt(def.EffectRealPointsPerLevel, i), effect.EffectRealPointsPerLevel, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectBasePoints, i), effect.EffectBasePoints, "spell %d effect %d", spell.ID, i)
			require.Nil(t, effect.EffectBasePointsF, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectMechanic, i), effect.EffectMechanic, "spell %d effect %d", spell.ID, i)
			require.Equal(t, []int32{intAt(def.EffectRadiusIndex, i)}, effect.EffectRadiusIndex, "spell %d effect %d", spell.ID, i)
			require.Equal(t, AuraEffect(intAt(def.EffectAura, i)), effect.EffectAura, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectAuraPeriod, i), effect.EffectAuraPeriod, "spell %d effect %d", spell.ID, i)
			require.Equal(t, floatAt(def.EffectAmplitude, i), effect.EffectAmplitude, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectChainTargets, i), effect.EffectChainTargets, "spell %d effect %d", spell.ID, i)
			require.Equal(t, ItemID(intAt(def.EffectItemType, i)), effect.EffectItemType, "spell %d effect %d", spell.ID, i)
			require.Equal(t, []int32{intAt(def.EffectMiscValue, i)}, effect.EffectMiscValue, "spell %d effect %d", spell.ID, i)
			require.Equal(t, SpellID(intAt(def.EffectTriggerSpell, i)), effect.EffectTriggerSpell, "spell %d effect %d", spell.ID, i)
			require.Equal(t, floatAt(def.EffectPointsPerCombo, i), effect.EffectPointsPerCombo, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectBaseDice, i), effect.EffectBaseDice, "spell %d effect %d", spell.ID, i)
			require.Equal(t, intAt(def.EffectDicePerLevel, i), effect.EffectDicePerLevel, "spell %d effect %d", spell.ID, i)
			require.Equal(t, floatAt(def.EffectChainAmplitude, i), effect.EffectChainAmplitude, "spell %d effect %d", spell.ID, i)
			require.Equal(t, []int32{intAt(def.ImplicitTargetA, i), intAt(def.ImplicitTargetB, i)}, effect.ImplicitTarget, "spell %d effect %d", spell.ID, i)
		}
	}
}
