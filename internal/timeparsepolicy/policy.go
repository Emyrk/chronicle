// Package timeparsepolicy defines the time-parse scoring semantics for Chronicle.
//
// A "time parse" is a 0–100 score for a raid's clear time or per-boss kill time,
// computed as an inclusive lower-is-better percentile within a cohort of comparable
// runs. This package owns the scoring algorithm, eligibility rules, sample-size
// thresholds, and average encounter parse merging — but has no database, HTTP, or
// frontend dependencies.
//
// Canonical policy (version 1):
//   - Clear time: qualified complete runs only. Lower duration = higher score.
//   - Boss kill time: clean boss kills from otherwise cohort-eligible partial or
//     complete runs. Lower duration = higher score.
//   - Duplicate run identity (duplicate_group_id) contributes one deterministic
//     fastest datapoint.
//   - Cohort compatibility: tenant, instance name, difficulty, declared max raid size.
//   - Existing bounded lookback strategy (window_start … cutoff).
//   - Minimum sample: 5.
//   - Scoring: inclusive lower-is-better percentile = count(value >= target) / N × 100.
//   - Average encounter parse: arithmetic mean of available per-boss scores with coverage.
//   - No parser/addon minimum-version eligibility.
package timeparsepolicy

// PolicyVersion is bumped whenever the time-parse scoring semantics change.
// Snapshots record which version produced them so results are reproducible.
const PolicyVersion = 1

// Sample-size thresholds. These count datapoints (runs for clear time,
// kills for boss time) not distinct players or guilds.
const (
	// MinSampleForParse is the minimum cohort size to produce any score.
	MinSampleForParse = 5
	// MinSampleForConfidence is the cohort size at which scores are no longer
	// flagged as low-confidence.
	MinSampleForConfidence = 20
)

// Status describes the outcome of a scoring attempt.
type Status string

const (
	StatusOK             Status = "ok"
	StatusLowConfidence  Status = "low_confidence"
	StatusSampleTooSmall Status = "sample_too_small"
)
