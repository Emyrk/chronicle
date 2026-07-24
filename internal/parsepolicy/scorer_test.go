package parsepolicy_test

import (
	"math"
	"testing"

	"github.com/Emyrk/chronicle/internal/parsepolicy"
)

// Hand-verified N=6 fixture from the issue.
// Cohort (sorted): [100, 200, 300, 400, 500, 600]
// Positions:
//   100 → (0+0.5)/6*100 =  8.333…
//   200 → (1+0.5)/6*100 = 25.000
//   300 → (2+0.5)/6*100 = 41.667…
//   400 → (3+0.5)/6*100 = 58.333…
//   500 → (4+0.5)/6*100 = 75.000
//   600 → 100 (max anchor)
var fixtureN6 = []float64{100, 200, 300, 400, 500, 600}

func TestScore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		cohort       []float64
		value        float64
		wantOK       bool
		wantPrecise  float64
		wantDisplay  int
		wantRank     int
		wantStatus   parsepolicy.Status
		precisionEps float64 // default 1e-9
	}{
		// ── N=6 fixture ──
		{
			name:        "n6/equal_to_min",
			cohort:      fixtureN6,
			value:       100,
			wantOK:      true,
			wantPrecise: 8.333333333333334,
			wantDisplay: 8,
			wantRank:    6,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/equal_to_mid",
			cohort:      fixtureN6,
			value:       300,
			wantOK:      true,
			wantPrecise: 41.66666666666667,
			wantDisplay: 42,
			wantRank:    4,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/between_two_points",
			cohort:      fixtureN6,
			value:       250,
			wantOK:      true,
			wantPrecise: 33.333333333333336,
			wantDisplay: 33,
			wantRank:    5,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/equal_to_max",
			cohort:      fixtureN6,
			value:       600,
			wantOK:      true,
			wantPrecise: 100,
			wantDisplay: 100,
			wantRank:    1,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/above_max",
			cohort:      fixtureN6,
			value:       700,
			wantOK:      true,
			wantPrecise: 100,
			wantDisplay: 100,
			wantRank:    1,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/below_min",
			cohort:      fixtureN6,
			value:       50,
			wantOK:      true,
			wantPrecise: 4.166666666666667,
			wantDisplay: 4,
			wantRank:    7,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "n6/between_second_best_and_max",
			cohort:      fixtureN6,
			value:       550,
			wantOK:      true,
			wantPrecise: 87.5,
			wantDisplay: 88,
			wantRank:    2,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},

		// ── Ties ──
		{
			name:        "tie_at_bottom",
			cohort:      []float64{100, 100, 300, 400, 500},
			value:       100,
			wantOK:      true,
			wantPrecise: 20, // avg of (0.5/5, 1.5/5)*100 = avg(10,30) = 20
			wantDisplay: 20,
			wantRank:    4,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "tie_at_middle",
			cohort:      []float64{100, 300, 300, 400, 500},
			value:       300,
			wantOK:      true,
			wantPrecise: 40, // avg of (1.5/5, 2.5/5)*100 = avg(30,50) = 40
			wantDisplay: 40,
			wantRank:    3,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "tie_with_max",
			cohort:      []float64{100, 200, 300, 500, 500},
			value:       500,
			wantOK:      true,
			wantPrecise: 100, // group containing max shares 100
			wantDisplay: 100,
			wantRank:    1,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "all_equal",
			cohort:      []float64{42, 42, 42, 42, 42},
			value:       42,
			wantOK:      true,
			wantPrecise: 100, // all match max
			wantDisplay: 100,
			wantRank:    1,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},

		// ── Sample size boundaries ──
		{
			name:       "sample_too_small_0",
			cohort:     nil,
			value:      100,
			wantOK:     false,
			wantStatus: parsepolicy.StatusSampleTooSmall,
		},
		{
			name:       "sample_too_small_1",
			cohort:     []float64{100},
			value:      100,
			wantOK:     false,
			wantStatus: parsepolicy.StatusSampleTooSmall,
		},
		{
			name:       "sample_too_small_4",
			cohort:     []float64{100, 200, 300, 400},
			value:      200,
			wantOK:     false,
			wantStatus: parsepolicy.StatusSampleTooSmall,
		},
		{
			name:        "sample_5_low_confidence",
			cohort:      []float64{100, 200, 300, 400, 500},
			value:       300,
			wantOK:      true,
			wantPrecise: 50, // (2+0.5)/5*100 = 50
			wantDisplay: 50,
			wantRank:    3,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "sample_19_low_confidence",
			cohort:      makeLinear(19, 100, 100),
			value:       1000, // midpoint
			wantOK:      true,
			wantRank:    10,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:       "sample_20_ok",
			cohort:     makeLinear(20, 100, 100),
			value:      1050,
			wantOK:     true,
			wantRank:   11, // 10 values > 1050, so rank = 11
			wantStatus: parsepolicy.StatusOK,
		},

		// ── Rounding edge cases ──
		{
			name:        "rounds_to_0",
			cohort:      makeLinear(5, 1000, 100),
			value:       1, // way below min; (1/1000)*10 = 0.01
			wantOK:      true,
			wantDisplay: 0,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},
		{
			name:        "rounds_to_100",
			cohort:      fixtureN6,
			value:       600,
			wantOK:      true,
			wantDisplay: 100,
			wantStatus:  parsepolicy.StatusLowConfidence,
		},

		// ── Rejection ──
		{
			name:   "reject_nan_value",
			cohort: fixtureN6,
			value:  math.NaN(),
			wantOK: false,
		},
		{
			name:   "reject_inf_value",
			cohort: fixtureN6,
			value:  math.Inf(1),
			wantOK: false,
		},
		{
			name:   "reject_zero_value",
			cohort: fixtureN6,
			value:  0,
			wantOK: false,
		},
		{
			name:   "reject_negative_value",
			cohort: fixtureN6,
			value:  -1,
			wantOK: false,
		},
		{
			name:   "reject_nan_in_cohort",
			cohort: []float64{100, 200, math.NaN(), 400, 500},
			value:  300,
			wantOK: false,
		},
		{
			name:   "reject_zero_in_cohort",
			cohort: []float64{0, 200, 300, 400, 500},
			value:  300,
			wantOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			res, ok := parsepolicy.Score(tc.cohort, tc.value)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v (result: %+v)", ok, tc.wantOK, res)
			}
			if !ok {
				if tc.wantStatus != "" && res.Status != tc.wantStatus {
					t.Fatalf("status = %q, want %q", res.Status, tc.wantStatus)
				}
				return
			}
			if tc.wantStatus != "" && res.Status != tc.wantStatus {
				t.Errorf("status = %q, want %q", res.Status, tc.wantStatus)
			}
			if tc.wantPrecise != 0 {
				eps := tc.precisionEps
				if eps == 0 {
					eps = 1e-9
				}
				if math.Abs(res.PreciseScore-tc.wantPrecise) > eps {
					t.Errorf("precise = %v, want %v", res.PreciseScore, tc.wantPrecise)
				}
			}
			if tc.wantDisplay != 0 && res.DisplayScore != tc.wantDisplay {
				t.Errorf("display = %d, want %d", res.DisplayScore, tc.wantDisplay)
			}
			if tc.wantRank != 0 && res.Rank != tc.wantRank {
				t.Errorf("rank = %d, want %d", res.Rank, tc.wantRank)
			}
		})
	}
}

func TestAverageParse(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		scores       []float64
		selected     int
		wantOK       bool
		wantPrecise  float64
		wantDisplay  int
		wantKilled   int
		wantSelected int
	}{
		{
			name:         "full_coverage",
			scores:       []float64{80, 90, 70, 60, 50, 40, 30, 20, 10, 85, 95, 100},
			selected:     12,
			wantOK:       true,
			wantPrecise:  60.833333333333336,
			wantDisplay:  61,
			wantKilled:   12,
			wantSelected: 12,
		},
		{
			name:         "partial_coverage_10_of_12",
			scores:       []float64{80, 90, 70, 60, 50, 40, 30, 20, 10, 85},
			selected:     12,
			wantOK:       true,
			wantPrecise:  53.5,
			wantDisplay:  54,
			wantKilled:   10,
			wantSelected: 12,
		},
		{
			name:         "single_boss",
			scores:       []float64{78.5},
			selected:     1,
			wantOK:       true,
			wantPrecise:  78.5,
			wantDisplay:  79,
			wantKilled:   1,
			wantSelected: 1,
		},
		{
			name:         "no_kills",
			scores:       nil,
			selected:     12,
			wantOK:       false,
			wantSelected: 12,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			res, ok := parsepolicy.AverageParse(tc.scores, tc.selected)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if !ok {
				if res.Selected != tc.wantSelected {
					t.Errorf("selected = %d, want %d", res.Selected, tc.wantSelected)
				}
				return
			}
			if math.Abs(res.PreciseScore-tc.wantPrecise) > 1e-9 {
				t.Errorf("precise = %v, want %v", res.PreciseScore, tc.wantPrecise)
			}
			if res.DisplayScore != tc.wantDisplay {
				t.Errorf("display = %d, want %d", res.DisplayScore, tc.wantDisplay)
			}
			if res.Killed != tc.wantKilled {
				t.Errorf("killed = %d, want %d", res.Killed, tc.wantKilled)
			}
			if res.Selected != tc.wantSelected {
				t.Errorf("selected = %d, want %d", res.Selected, tc.wantSelected)
			}
		})
	}
}

func TestRoundDisplay(t *testing.T) {
	t.Parallel()
	tests := []struct {
		in   float64
		want int
	}{
		{0.0, 0},
		{0.4, 0},
		{0.5, 1}, // math.Round uses round-half-to-even: 0.5 → 0, but Go rounds 0.5 → 1
		{0.6, 1},
		{49.5, 50}, // 49.5 → 50 (banker's: rounds to even)
		{99.4, 99},
		{99.5, 100}, // 99.5 → 100 (banker's: rounds to even)
		{100.0, 100},
		{100.6, 100}, // clamped
		{-1, 0},      // clamped
	}
	for _, tc := range tests {
		got := parsepolicy.RoundDisplay(tc.in)
		if got != tc.want {
			t.Errorf("RoundDisplay(%v) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestPolicy(t *testing.T) {
	t.Parallel()
	p := parsepolicy.DefaultPolicy(parsepolicy.MetricDPS)
	if p.Version != parsepolicy.PolicyVersion {
		t.Errorf("version = %d, want %d", p.Version, parsepolicy.PolicyVersion)
	}
	if p.CohortMode != parsepolicy.CohortModeSpec {
		t.Errorf("cohort_mode = %q, want %q", p.CohortMode, parsepolicy.CohortModeSpec)
	}
	if p.LookbackDays != parsepolicy.DefaultLookbackDays {
		t.Errorf("lookback = %d, want %d", p.LookbackDays, parsepolicy.DefaultLookbackDays)
	}
}

// makeLinear returns n values starting at start with the given step.
func makeLinear(n int, start, step float64) []float64 {
	vals := make([]float64, n)
	for i := range vals {
		vals[i] = start + float64(i)*step
	}
	return vals
}
