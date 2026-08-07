package roleinfer_test

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/roleinfer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestInferTanks_SingleSourceClearTank(t *testing.T) {
	t.Parallel()

	// Boss melees warrior 20 times, mage 2 times.
	// warrior sourceScore = 20 / (20+5) = 0.80  → tank
	// mage    sourceScore =  2 / (20+5) = 0.08  → not tank
	attacks := roleinfer.IncomingAutoAttacks[string, string]{
		"boss": {
			"warrior": 20,
			"mage":    2,
		},
	}

	results := roleinfer.InferTanks(attacks)
	require.Len(t, results, 2)

	assert.True(t, results["warrior"].IsTank)
	assert.InDelta(t, 0.80, results["warrior"].TankScore, 0.001)
	assert.Equal(t, "boss", results["warrior"].StrongestSource)
	assert.Equal(t, 20, results["warrior"].PlayerAttempts)
	assert.Equal(t, 20, results["warrior"].MaxAttempts)

	assert.False(t, results["mage"].IsTank)
	assert.InDelta(t, 0.08, results["mage"].TankScore, 0.001)
}

func TestInferTanks_MultipleSourcesMaxScore(t *testing.T) {
	t.Parallel()

	// Two bosses, warrior tanks both, paladin off-tanks boss2.
	attacks := roleinfer.IncomingAutoAttacks[string, string]{
		"boss1": {
			"warrior": 30,
			"paladin": 3,
			"mage":    1,
		},
		"boss2": {
			"warrior": 5,
			"paladin": 25,
			"mage":    2,
		},
	}

	results := roleinfer.InferTanks(attacks)
	require.Len(t, results, 3)

	// warrior: max from boss1 = 30/(30+5) ≈ 0.857
	assert.True(t, results["warrior"].IsTank)
	assert.InDelta(t, 30.0/35.0, results["warrior"].TankScore, 0.001)

	// paladin: max from boss2 = 25/(25+5) ≈ 0.833
	assert.True(t, results["paladin"].IsTank)
	assert.InDelta(t, 25.0/30.0, results["paladin"].TankScore, 0.001)

	// mage: best is boss2 = 2/(25+5) ≈ 0.067
	assert.False(t, results["mage"].IsTank)
}

func TestInferTanks_AoEDamageDoesNotMakeTank(t *testing.T) {
	t.Parallel()

	// Scenario: a boss cleaves everyone roughly equally. Nobody should be a tank
	// because the evidence is spread out, and the evidence damping means no player
	// reaches the threshold with low absolute counts.
	attacks := roleinfer.IncomingAutoAttacks[string, string]{
		"cleave_boss": {
			"player1": 3,
			"player2": 3,
			"player3": 3,
			"player4": 3,
			"player5": 3,
		},
	}

	results := roleinfer.InferTanks(attacks)
	// sourceScore for each = 3 / (3+5) = 0.375 → below TankThreshold (0.5)
	for _, r := range results {
		assert.False(t, r.IsTank, "evenly-spread AoE should not produce a tank")
		assert.InDelta(t, 3.0/8.0, r.TankScore, 0.001)
	}
}

func TestInferTanks_ZeroDamageAttemptsCounted(t *testing.T) {
	t.Parallel()

	// All swings on the warrior were dodged/parried (zero damage) but should
	// still count as attempts because the source "chose" to attack the warrior.
	attacks := roleinfer.IncomingAutoAttacks[string, string]{
		"boss": {
			"warrior": 15, // includes zero-damage swings — same count bucket
			"rogue":   1,
		},
	}

	results := roleinfer.InferTanks(attacks)
	// warrior: 15 / (15+5) = 0.75 → tank
	assert.True(t, results["warrior"].IsTank)
	assert.InDelta(t, 0.75, results["warrior"].TankScore, 0.001)
}

func TestInferTanks_Empty(t *testing.T) {
	t.Parallel()

	results := roleinfer.InferTanks(roleinfer.IncomingAutoAttacks[string, string]{})
	require.Empty(t, results)
}

func TestInferTanks_ThresholdBoundary(t *testing.T) {
	t.Parallel()

	// Exactly at threshold: 5 / (5+5) = 0.5 → tank (≥)
	attacks := roleinfer.IncomingAutoAttacks[string, string]{
		"boss": {
			"tank":    5,
			"offtank": 4, // 4/10 = 0.4 → not tank
		},
	}
	results := roleinfer.InferTanks(attacks)
	assert.True(t, results["tank"].IsTank)
	assert.False(t, results["offtank"].IsTank)
}

func TestInferTanks_Constants(t *testing.T) {
	t.Parallel()

	assert.Equal(t, 1, roleinfer.AlgorithmVersion)
	assert.Equal(t, 0.5, roleinfer.TankThreshold)
	assert.Equal(t, 5, roleinfer.EvidenceAttempts)
}
