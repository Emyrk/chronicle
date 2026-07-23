package parsepolicy

import (
	"math"
	"sort"
)

// cohortPoint is a deduplicated (value, position) pair used internally.
type cohortPoint struct {
	value    float64
	position float64
}

// ScoreResult is the output of Score.
type ScoreResult struct {
	// PreciseScore is the exact interpolated 0–100 value.
	PreciseScore float64
	// DisplayScore is PreciseScore rounded to the nearest integer,
	// clamped to [0, 100].
	DisplayScore int
	// Rank is the 1-based position among the cohort (1 = best).
	// If the scored value is above the cohort max, rank is 1.
	// If the value is not in the cohort, rank is the position it would
	// occupy after insertion.
	Rank int
	// SampleSize is len(cohort).
	SampleSize int
	// Status indicates confidence level.
	Status Status
}

// Score computes a parse score for value against the given cohort.
//
// cohort must contain one best metric value per player, pre-deduplicated by
// the caller. The slice is copied and sorted internally.
//
// Returns an error description if value or any cohort entry is non-finite or
// non-positive, or if the cohort is too small (< MinSampleForParse).
func Score(cohort []float64, value float64) (ScoreResult, bool) {
	if !isFinitePositive(value) {
		return ScoreResult{}, false
	}
	n := len(cohort)
	if n < MinSampleForParse {
		return ScoreResult{
			SampleSize: n,
			Status:     StatusSampleTooSmall,
		}, false
	}

	// Copy and sort ascending.
	sorted := make([]float64, n)
	copy(sorted, cohort)
	sort.Float64s(sorted)

	for _, v := range sorted {
		if !isFinitePositive(v) {
			return ScoreResult{}, false
		}
	}

	cohortMax := sorted[n-1]

	// Build deduplicated (value, position) pairs.
	points := buildPositions(sorted, n)

	// Value >= cohort max ⇒ exactly 100.
	if value >= cohortMax {
		return result(100.0, n, 1), true
	}

	// Interpolate.
	score := interpolate(points, value, n)

	// Determine rank: count of cohort values strictly greater than value, + 1.
	// Count of elements > value = n - (index of first element > value).
	upper := sort.SearchFloat64s(sorted, math.Nextafter(value, math.MaxFloat64))
	rankVal := n - upper + 1

	return result(score, n, rankVal), true
}

// buildPositions returns deduplicated (value, position) pairs from a sorted
// ascending cohort. The maximum is anchored at 100; others use midpoint
// plotting positions (i-0.5)/N*100 where i is 1-based. Ties share the
// average midpoint of their occupied indices.
func buildPositions(sorted []float64, n int) []cohortPoint {
	var pts []cohortPoint
	i := 0
	for i < n {
		v := sorted[i]
		// Find the run of equal values.
		j := i + 1
		for j < n && sorted[j] == v {
			j++
		}
		var pos float64
		if j == n {
			// This group contains the maximum.
			pos = 100.0
		} else {
			// Average of midpoint positions for indices i..j-1 (0-based).
			// Midpoint for 0-based index k: (k+1 - 0.5) / N * 100 = (k+0.5)/N*100.
			sum := 0.0
			for k := i; k < j; k++ {
				sum += (float64(k) + 0.5) / float64(n) * 100.0
			}
			pos = sum / float64(j-i)
		}
		pts = append(pts, cohortPoint{value: v, position: pos})
		i = j
	}
	return pts
}

// interpolate finds the score for value by linear interpolation between
// adjacent position points. value must be < cohort max.
func interpolate(points []cohortPoint, value float64, n int) float64 {
	// Find the two bracketing points.
	// points are sorted by value (ascending, deduplicated).
	idx := sort.Search(len(points), func(i int) bool {
		return points[i].value >= value
	})

	if idx < len(points) && points[idx].value == value {
		return points[idx].position
	}

	// value is between points[idx-1] and points[idx].
	if idx == 0 {
		// Below the cohort minimum: interpolate between (0, 0) and points[0].
		minVal := points[0].value
		minPos := points[0].position
		score := (value / minVal) * minPos
		if score < 0 {
			score = 0
		}
		return score
	}

	lo := points[idx-1]
	hi := points[idx]
	t := (value - lo.value) / (hi.value - lo.value)
	return lo.position + t*(hi.position-lo.position)
}

func result(score float64, sampleSize, rank int) ScoreResult {
	status := StatusOK
	if sampleSize < MinSampleForConfidence {
		status = StatusLowConfidence
	}
	return ScoreResult{
		PreciseScore: score,
		DisplayScore: RoundDisplay(score),
		Rank:         rank,
		SampleSize:   sampleSize,
		Status:       status,
	}
}

// RoundDisplay converts a precise 0–100 score to a display integer.
// It uses round-half-up and clamps to [0, 100].
func RoundDisplay(score float64) int {
	d := int(math.Round(score))
	if d < 0 {
		return 0
	}
	if d > 100 {
		return 100
	}
	return d
}

func isFinitePositive(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0) && v > 0
}

// AverageParseResult is the output of AverageParse.
type AverageParseResult struct {
	// PreciseScore is the arithmetic mean of the per-boss precise scores.
	PreciseScore float64
	// DisplayScore is RoundDisplay(PreciseScore).
	DisplayScore int
	// Killed is the number of selected bosses the player killed.
	Killed int
	// Selected is the total number of bosses in the selection.
	Selected int
}

// AverageParse computes the arithmetic mean of per-boss parse scores over
// killed bosses in a selection.
//
// scores maps boss identifier → per-boss precise parse score for bosses the
// player killed. selected is the total number of bosses in the selection
// (must be >= len(scores)).
//
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
		DisplayScore: RoundDisplay(avg),
		Killed:       killed,
		Selected:     selected,
	}, true
}
