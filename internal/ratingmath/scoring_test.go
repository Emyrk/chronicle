package ratingmath

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func candidateMasteryPolicy() MasteryPolicy {
	return MasteryPolicy{
		HalfLife:   42 * 24 * time.Hour,
		BestWeight: .3, FormWeight: .5, FloorWeight: .2,
		RankWeight: func(n int) float64 {
			if n >= 5 {
				return 1
			}
			return .65 + .35*float64(n-1)/4
		},
	}
}

func TestScoreMastery(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	policy := candidateMasteryPolicy()
	result, err := ScoreMastery([]ParseObservation{{Score: 100, KilledAt: now}}, policy)
	require.NoError(t, err)
	require.Equal(t, 100.0, result.Mastery)
	require.Equal(t, 65.0, result.Ranked)
	require.InDelta(t, 1-math.Exp(-.25), result.Confidence, 1e-12)

	fiveKills := []ParseObservation{
		{Score: 10, KilledAt: now}, {Score: 20, KilledAt: now},
		{Score: 30, KilledAt: now}, {Score: 40, KilledAt: now},
		{Score: 100, KilledAt: now},
	}
	result, err = ScoreMastery(fiveKills, policy)
	require.NoError(t, err)
	require.Equal(t, 5, result.EligibleKills)
	require.Equal(t, 1, result.ExcludedKills)
	require.Equal(t, 100.0, result.Best)
	require.Equal(t, 30.0, result.Form)
	require.Equal(t, 20.0, result.Floor)
	require.Equal(t, 49.0, result.Mastery)
	require.Equal(t, result.Mastery, result.Ranked)

	observations := []ParseObservation{
		{Score: 10, KilledAt: now.Add(-24 * time.Hour)},
		{Score: 80, KilledAt: now.Add(-42 * 24 * time.Hour)},
		{Score: 90, KilledAt: now.Add(-42 * 24 * time.Hour)},
		{Score: 95, KilledAt: now.Add(-42 * 24 * time.Hour)},
		{Score: 97, KilledAt: now.Add(-42 * 24 * time.Hour)},
		{Score: 100, KilledAt: now},
	}
	original := append([]ParseObservation(nil), observations...)
	result, err = ScoreMastery(observations, policy)
	require.NoError(t, err)
	require.Equal(t, original, observations, "sorting must not mutate source observations")
	require.Equal(t, 6, result.EligibleKills)
	require.Equal(t, 1, result.ExcludedKills)
	require.Equal(t, 100.0, result.Best)
	require.Equal(t, 95.0, result.Form)
	require.Equal(t, 90.0, result.Floor)
	require.InDelta(t, 95.5, result.Mastery, 1e-12)
	require.Equal(t, result.Mastery, result.Ranked)

	_, err = ScoreMastery([]ParseObservation{{Score: math.NaN(), KilledAt: now}}, policy)
	require.Error(t, err)
	_, err = ScoreMastery([]ParseObservation{{Score: 1, KilledAt: now}}, MasteryPolicy{})
	require.Error(t, err)
}

func TestPeakAndRenownAward(t *testing.T) {
	t.Parallel()
	peak, err := Peak(900, 1200)
	require.NoError(t, err)
	require.Equal(t, 75.0, peak)
	_, err = Peak(1201, 1200)
	require.Error(t, err)
	_, err = Peak(0, 1200)
	require.Error(t, err)
	points, err := RenownAward(5, 3, true)
	require.NoError(t, err)
	require.Equal(t, 8.0, points)
	points, err = RenownAward(5, 3, false)
	require.NoError(t, err)
	require.Equal(t, 5.0, points)
	_, err = RenownAward(-1, 3, true)
	require.Error(t, err)
}
