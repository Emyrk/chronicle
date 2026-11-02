package ratingmath

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAggregateBossScoresFixedDenominator(t *testing.T) {
	t.Parallel()
	manifest := []WeightedBoss{
		{Instance: "Molten Core", Encounter: "Lucifron", Weight: 1},
		{Instance: "Molten Core", Encounter: "Ragnaros", Weight: 3},
	}
	scores := map[BossKey]float64{{Instance: "Molten Core", Encounter: "Lucifron"}: 100}
	score, err := AggregateBossScores(manifest, scores)
	require.NoError(t, err)
	require.Equal(t, 25.0, score, "missing eligible boss is zero, not removed from denominator")
	scores[BossKey{Instance: "Molten Core", Encounter: "Ragnaros"}] = 80
	score, err = AggregateBossScores(manifest, scores)
	require.NoError(t, err)
	require.Equal(t, 85.0, score)
	_, err = AggregateBossScores(append(manifest, manifest[0]), scores)
	require.Error(t, err, "duplicate boss must not silently change denominator")
	_, err = AggregateBossScores(nil, scores)
	require.Error(t, err)
}
