package timeparsepolicy

import (
	"math"
	"sort"
)

// ScoreResult is the output of ScoreTime.
type ScoreResult struct {
	// PreciseScore is the exact 0–100 percentile.
	PreciseScore float64
	// DisplayScore is PreciseScore rounded to the nearest integer, clamped [0, 100].
	DisplayScore int
	// Rank is the 1-based position (1 = fastest).
	Rank int
	// SampleSize is len(cohort).
	SampleSize int
	// Status indicates confidence level.
	Status Status
}

// ScoreTime computes a lower-is-better percentile for durationMs against the
// given cohort of comparable durations (in the same unit, typically ms).
//
// Formula: count(cohort values >= durationMs) / len(cohort) × 100.
// A duration equal to the fastest cohort member scores 100 (inclusive tie).
//
// cohort is copied and sorted internally. Returns ok=false when the cohort is
// too small (< MinSampleForParse) or durationMs <= 0.
func ScoreTime(cohort []int64, durationMs int64) (ScoreResult, bool) {
	if durationMs <= 0 {
		return ScoreResult{}, false
	}
	n := len(cohort)
	if n < MinSampleForParse {
		return ScoreResult{
			SampleSize: n,
			Status:     StatusSampleTooSmall,
		}, false
	}

	sorted := make([]int64, n)
	copy(sorted, cohort)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	// Inclusive lower-is-better: count of cohort values >= durationMs.
	atLeastAsSlow := 0
	for _, v := range sorted {
		if v >= durationMs {
			atLeastAsSlow++
		}
	}

	precise := float64(atLeastAsSlow) / float64(n) * 100.0

	// Rank: 1-based position = number of cohort values strictly less + 1.
	rank := sort.Search(n, func(i int) bool { return sorted[i] >= durationMs }) + 1

	status := StatusOK
	if n < MinSampleForConfidence {
		status = StatusLowConfidence
	}

	return ScoreResult{
		PreciseScore: precise,
		DisplayScore: roundDisplay(precise),
		Rank:         rank,
		SampleSize:   n,
		Status:       status,
	}, true
}

// roundDisplay converts a precise 0–100 score to a display integer.
func roundDisplay(score float64) int {
	d := int(math.Round(score))
	if d < 0 {
		return 0
	}
	if d > 100 {
		return 100
	}
	return d
}

// AverageParseResult is the output of AverageParse.
type AverageParseResult struct {
	// PreciseScore is the arithmetic mean of per-boss precise scores.
	PreciseScore float64
	// DisplayScore is roundDisplay(PreciseScore).
	DisplayScore int
	// Killed is the number of bosses with a score.
	Killed int
	// Selected is the total number of bosses in the selection.
	Selected int
}

// AverageParse computes the arithmetic mean of per-boss time parse scores.
// Returns ok=false if scores is empty.
func AverageParse(scores []float64, selected int) (AverageParseResult, bool) {
	killed := len(scores)
	if killed == 0 {
		return AverageParseResult{Selected: selected}, false
	}
	sum := 0.0
	for _, s := range scores {
		sum += s
	}
	avg := sum / float64(killed)
	return AverageParseResult{
		PreciseScore: avg,
		DisplayScore: roundDisplay(avg),
		Killed:       killed,
		Selected:     selected,
	}, true
}
