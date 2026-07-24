// Package parsepolicy defines the parse scoring semantics for Chronicle.
//
// A "parse" is a 0–100 score for a player's metric (DPS or HPS) on a boss,
// computed by value-interpolation within a cohort of comparable performances.
// This package owns the scoring algorithm, eligibility rules, sample-size
// thresholds, and Average Parse merging — but has no database, HTTP, or
// frontend dependencies.
package parsepolicy

// PolicyVersion is bumped whenever the scoring semantics change.
// Snapshots record which version produced them so results are reproducible.
const PolicyVersion = 1

// Metric identifies what is being scored.
type Metric string

const (
	MetricDPS Metric = "dps"
	MetricHPS Metric = "hps"
)

// CohortMode controls how players are grouped for comparison.
type CohortMode string

const (
	CohortModeSpec     CohortMode = "spec"
	CohortModeClass    CohortMode = "class"
	CohortModeDisabled CohortMode = "disabled"
)

// LookbackDays defines the rolling window for cohort inclusion.
// 0 means all-time.
type LookbackDays int

const (
	LookbackAllTime LookbackDays = 0
	Lookback30Days  LookbackDays = 30
	Lookback90Days  LookbackDays = 90
	Lookback180Days LookbackDays = 180
)

// Sample-size thresholds.
const (
	// MinSampleForParse is the minimum cohort size to produce any parse score.
	MinSampleForParse = 5
	// MinSampleForConfidence is the cohort size at which scores are no longer
	// flagged as low-confidence.
	MinSampleForConfidence = 20
)

// Status describes the outcome of a scoring attempt.
type Status string

const (
	StatusOK            Status = "ok"
	StatusLowConfidence Status = "low_confidence"
	StatusSampleTooSmall Status = "sample_too_small"
)

// Reason is a caller-supplied constant explaining why a parse could not be
// computed at all. The scorer itself never returns this — it is provided for
// callers that need to signal context the scorer cannot see (e.g. unknown spec
// in spec-mode cohorts).
type Reason string

const (
	ReasonUnknownSpec Reason = "unknown_spec"
)

// Policy holds the immutable configuration for a scoring run.
type Policy struct {
	Version      int          `json:"version"`
	Metric       Metric       `json:"metric"`
	CohortMode   CohortMode   `json:"cohort_mode"`
	LookbackDays LookbackDays `json:"lookback_days"`
}

// DefaultPolicy returns a policy with sensible defaults.
func DefaultPolicy(metric Metric) Policy {
	return Policy{
		Version:      PolicyVersion,
		Metric:       metric,
		CohortMode:   CohortModeSpec,
		LookbackDays: LookbackAllTime,
	}
}
