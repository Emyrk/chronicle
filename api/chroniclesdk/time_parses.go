package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceTimeParsesResponse contains time-based parse scores for a specific
// instance, scoring clear time and per-boss kill times against an immutable
// population snapshot.
type InstanceTimeParsesResponse struct {
	Available    bool      `json:"available"`
	Reason       string    `json:"reason,omitempty"`
	SnapshotID   uuid.UUID `json:"snapshot_id"`
	Cutoff       time.Time `json:"cutoff"`
	LookbackDays int32     `json:"lookback_days"`

	// PolicyVersion and QueryVersion identify the scoring semantics used.
	PolicyVersion int16 `json:"policy_version"`
	QueryVersion  int16 `json:"query_version"`

	// ClearTime is the instance's clear-time parse against the population.
	// Nil when the instance has no qualified clear.
	ClearTime *TimeParseScore `json:"clear_time,omitempty"`

	// BossKillTimes contains per-boss kill-time parses.
	BossKillTimes []BossKillTimeParse `json:"boss_kill_times"`

	// AverageBossKillParse is the arithmetic mean of available per-boss
	// precise scores. Nil when no bosses are scored.
	AverageBossKillParse *TimeParseAverage `json:"average_boss_kill_parse,omitempty"`
}

// TimeParseScore is a single time-based parse result.
type TimeParseScore struct {
	DurationMs   int64   `json:"duration_ms"`
	PreciseScore float64 `json:"precise_score"`
	DisplayScore int     `json:"display_score"`
	Rank         int     `json:"rank"`
	SampleSize   int     `json:"sample_size"`
	Status       string  `json:"status"`
}

// BossKillTimeParse is a per-boss kill-time parse.
type BossKillTimeParse struct {
	EncounterName string `json:"encounter_name"`
	DurationMs    int64  `json:"duration_ms"`
	PreciseScore  float64 `json:"precise_score"`
	DisplayScore  int     `json:"display_score"`
	Rank          int     `json:"rank"`
	SampleSize    int     `json:"sample_size"`
	Status        string  `json:"status"`
}

// TimeParseAverage is the average across per-boss time parses.
type TimeParseAverage struct {
	PreciseScore float64 `json:"precise_score"`
	DisplayScore int     `json:"display_score"`
	Killed       int     `json:"killed"`
	Selected     int     `json:"selected"`
}
