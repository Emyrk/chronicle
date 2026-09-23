package chrondbc

import (
	"bytes"
	"fmt"
	"os"
	"reflect"
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
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

	var (
		rows       int
		compareErr error
	)
	err = table.Range(func(def *dbdefs.Ent_Spell) bool {
		spell := SpellFromDB(def)
		expected := []SpellEffect{
			legacySpellEffect(def, 0),
			legacySpellEffect(def, 1),
			legacySpellEffect(def, 2),
		}
		if !reflect.DeepEqual(expected, spell.Effects) {
			compareErr = fmt.Errorf("spell %d effects mismatch:\nexpected: %#v\nactual:   %#v", spell.ID, expected, spell.Effects)
			return false
		}
		rows++
		return true
	})
	require.NoError(t, err)
	require.NoError(t, compareErr)
	require.Equal(t, table.Len(), rows)
}

func legacySpellEffect(def *dbdefs.Ent_Spell, index int) SpellEffect {
	radiusIndex := intAt(def.EffectRadiusIndex, index)
	return SpellEffect{
		EffectIndex:              int32(index),
		Effect:                   Effect(intAt(def.Effect, index)),
		EffectDieSides:           intAt(def.EffectDieSides, index),
		EffectRealPointsPerLevel: floatAt(def.EffectRealPointsPerLevel, index),
		EffectBasePoints:         intAt(def.EffectBasePoints, index),
		EffectMechanic:           intAt(def.EffectMechanic, index),
		EffectRadius:             dbcmem.GetSpellRadius(radiusIndex),
		EffectRadiusIndex:        []int32{radiusIndex},
		EffectAura:               AuraEffect(intAt(def.EffectAura, index)),
		EffectAuraPeriod:         intAt(def.EffectAuraPeriod, index),
		EffectAmplitude:          floatAt(def.EffectAmplitude, index),
		EffectChainTargets:       intAt(def.EffectChainTargets, index),
		EffectItemType:           ItemID(intAt(def.EffectItemType, index)),
		EffectMiscValue:          []int32{intAt(def.EffectMiscValue, index)},
		EffectTriggerSpell:       SpellID(intAt(def.EffectTriggerSpell, index)),
		EffectPointsPerCombo:     floatAt(def.EffectPointsPerCombo, index),
		EffectBaseDice:           intAt(def.EffectBaseDice, index),
		EffectDicePerLevel:       intAt(def.EffectDicePerLevel, index),
		EffectChainAmplitude:     floatAt(def.EffectChainAmplitude, index),
		ImplicitTarget: []int32{
			intAt(def.ImplicitTargetA, index),
			intAt(def.ImplicitTargetB, index),
		},
	}
}
