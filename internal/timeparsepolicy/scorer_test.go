package timeparsepolicy

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestScoreTime_Basic(t *testing.T) {
	t.Parallel()
	// Cohort: [100, 200, 300, 400, 500] ms
	cohort := []int64{100, 200, 300, 400, 500}

	// Fastest in cohort: 100ms → 100% (all values >= 100).
	res, ok := ScoreTime(cohort, 100)
	require.True(t, ok)
	assert.Equal(t, 100.0, res.PreciseScore)
	assert.Equal(t, 100, res.DisplayScore)
	assert.Equal(t, 1, res.Rank)
	assert.Equal(t, 5, res.SampleSize)

	// Middle of cohort: 300ms → 3/5 = 60%.
	res, ok = ScoreTime(cohort, 300)
	require.True(t, ok)
	assert.Equal(t, 60.0, res.PreciseScore)
	assert.Equal(t, 60, res.DisplayScore)
	assert.Equal(t, 3, res.Rank)

	// Slowest in cohort: 500ms → 1/5 = 20%.
	res, ok = ScoreTime(cohort, 500)
	require.True(t, ok)
	assert.Equal(t, 20.0, res.PreciseScore)
	assert.Equal(t, 20, res.DisplayScore)
	assert.Equal(t, 5, res.Rank)

	// Slower than cohort: 600ms → 0/5 = 0%.
	res, ok = ScoreTime(cohort, 600)
	require.True(t, ok)
	assert.Equal(t, 0.0, res.PreciseScore)
	assert.Equal(t, 0, res.DisplayScore)
	assert.Equal(t, 6, res.Rank)

	// Faster than cohort: 50ms → 5/5 = 100%.
	res, ok = ScoreTime(cohort, 50)
	require.True(t, ok)
	assert.Equal(t, 100.0, res.PreciseScore)
	assert.Equal(t, 100, res.DisplayScore)
	assert.Equal(t, 1, res.Rank)
}

func TestScoreTime_InclusiveTies(t *testing.T) {
	t.Parallel()
	// Five equal values: all tied at 200ms.
	cohort := []int64{200, 200, 200, 200, 200}

	// Exactly matching: 5/5 = 100% (inclusive tie).
	res, ok := ScoreTime(cohort, 200)
	require.True(t, ok)
	assert.Equal(t, 100.0, res.PreciseScore)
	assert.Equal(t, 1, res.Rank)

	// Faster: 100ms → 5/5 = 100%.
	res, ok = ScoreTime(cohort, 100)
	require.True(t, ok)
	assert.Equal(t, 100.0, res.PreciseScore)

	// Slower: 300ms → 0/5 = 0%.
	res, ok = ScoreTime(cohort, 300)
	require.True(t, ok)
	assert.Equal(t, 0.0, res.PreciseScore)
}

func TestScoreTime_SampleTooSmall(t *testing.T) {
	t.Parallel()
	cohort := []int64{100, 200, 300, 400} // 4 < MinSampleForParse (5)

	res, ok := ScoreTime(cohort, 200)
	require.False(t, ok)
	assert.Equal(t, StatusSampleTooSmall, res.Status)
	assert.Equal(t, 4, res.SampleSize)
}

func TestScoreTime_LowConfidence(t *testing.T) {
	t.Parallel()
	// 10 items: above MinSampleForParse but below MinSampleForConfidence.
	cohort := make([]int64, 10)
	for i := range cohort {
		cohort[i] = int64((i + 1) * 100)
	}

	res, ok := ScoreTime(cohort, 500)
	require.True(t, ok)
	assert.Equal(t, StatusLowConfidence, res.Status)
}

func TestScoreTime_HighConfidence(t *testing.T) {
	t.Parallel()
	cohort := make([]int64, 20)
	for i := range cohort {
		cohort[i] = int64((i + 1) * 100)
	}

	res, ok := ScoreTime(cohort, 1000)
	require.True(t, ok)
	assert.Equal(t, StatusOK, res.Status)
}

func TestScoreTime_ZeroDuration(t *testing.T) {
	t.Parallel()
	cohort := []int64{100, 200, 300, 400, 500}

	_, ok := ScoreTime(cohort, 0)
	require.False(t, ok)

	_, ok = ScoreTime(cohort, -1)
	require.False(t, ok)
}

func TestScoreTime_DoesNotMutateCohort(t *testing.T) {
	t.Parallel()
	cohort := []int64{500, 100, 400, 200, 300}
	original := make([]int64, len(cohort))
	copy(original, cohort)

	_, _ = ScoreTime(cohort, 300)

	assert.Equal(t, original, cohort, "ScoreTime should not mutate the input cohort")
}

func TestAverageParse(t *testing.T) {
	t.Parallel()

	// Normal case: 3 bosses scored.
	res, ok := AverageParse([]float64{100, 60, 40}, 5)
	require.True(t, ok)
	assert.InDelta(t, 66.67, res.PreciseScore, 0.01)
	assert.Equal(t, 67, res.DisplayScore)
	assert.Equal(t, 3, res.Killed)
	assert.Equal(t, 5, res.Selected)

	// Empty scores.
	_, ok = AverageParse([]float64{}, 3)
	require.False(t, ok)
}
