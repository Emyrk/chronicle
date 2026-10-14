package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceTimeParsesResponse contains live time-based parse scores for a
// specific instance, bounded by the reported UTC cutoff and lookback window.
type InstanceTimeParsesResponse struct {
	Available    bool       `json:"available"`
	Reason       string     `json:"reason,omitempty"`
	Cutoff       time.Time  `json:"cutoff"`
	WindowStart  *time.Time `json:"window_start,omitempty"`
	LookbackDays int32      `json:"lookback_days"`

	// PolicyVersion and QueryVersion identify the scoring semantics used.
	PolicyVersion int16 `json:"policy_version"`
	QueryVersion  int16 `json:"query_version"`

	ComputedAt time.Time                       `json:"computed_at"`
	Scopes     map[string]TimeParseScopeResult `json:"scopes"`

	// ClearTime is the instance's clear-time parse against the population.
	// Nil when the instance has no qualified clear.
	ClearTime *TimeParseScore `json:"clear_time,omitempty"`

	// BossKillTimes contains per-boss kill-time parses.
	BossKillTimes []BossKillTimeParse `json:"boss_kill_times"`

	// AverageBossKillParse is the arithmetic mean of available per-boss
	// precise scores. Nil when no bosses are scored.
	AverageBossKillParse *TimeParseAverage `json:"average_boss_kill_parse,omitempty"`
}

// TimeParseScopeResult is one locked server, realm, or guild result set.
type TimeParseScopeResult struct {
	Available            bool                `json:"available"`
	Reason               string              `json:"reason,omitempty"`
	ClearTime            *TimeParseScore     `json:"clear_time,omitempty"`
	BossKillTimes        []BossKillTimeParse `json:"boss_kill_times"`
	AverageBossKillParse *TimeParseAverage   `json:"average_boss_kill_parse,omitempty"`
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
	EncounterID   uuid.UUID `json:"encounter_id"`
	EncounterName string    `json:"encounter_name"`
	DurationMs    int64     `json:"duration_ms"`
	PreciseScore  float64   `json:"precise_score"`
	DisplayScore  int       `json:"display_score"`
	Rank          int       `json:"rank"`
	SampleSize    int       `json:"sample_size"`
	Status        string    `json:"status"`
}

// TimeParseAverage is the average across per-boss time parses.
type TimeParseAverage struct {
	PreciseScore float64 `json:"precise_score"`
	DisplayScore int     `json:"display_score"`
	Killed       int     `json:"killed"`
	Selected     int     `json:"selected"`
}

// TimeParseCohortKind selects which time-parse population a cohort viewer
// request reads.
type TimeParseCohortKind string

const (
	TimeParseCohortKindBossKill  TimeParseCohortKind = "boss_kill"
	TimeParseCohortKindClearTime TimeParseCohortKind = "clear_time"
)

// TimeParseCohortBucket is one comparable population in a time-parse
// snapshot. EncounterName is empty for clear-time buckets.
type TimeParseCohortBucket struct {
	Kind           TimeParseCohortKind `json:"kind"`
	InstanceName   string              `json:"instance_name"`
	EncounterName  string              `json:"encounter_name,omitempty"`
	DifficultyName string              `json:"difficulty_name"`
	MaxPlayers     int16               `json:"max_players"`
	SampleSize     int64               `json:"sample_size"`
}

// TimeParseCohortBucketsResponse lists every bucket in a live date window.
type TimeParseCohortBucketsResponse struct {
	Cutoff       time.Time               `json:"cutoff"`
	WindowStart  *time.Time              `json:"window_start,omitempty"`
	LookbackDays int32                   `json:"lookback_days"`
	Buckets      []TimeParseCohortBucket `json:"buckets"`
}

// TimeParseCohortEntry is one run in a time-parse cohort, scored against the
// rest of the cohort.
type TimeParseCohortEntry struct {
	Rank          int        `json:"rank"`
	DurationMs    int64      `json:"duration_ms"`
	PreciseScore  float64    `json:"precise_score"`
	DisplayScore  int        `json:"display_score"`
	KilledAt      time.Time  `json:"killed_at"`
	InstanceID    uuid.UUID  `json:"instance_id"`
	LogHashedSlug string     `json:"log_hashed_slug,omitempty"`
	GuildID       *uuid.UUID `json:"guild_id,omitempty"`
	GuildName     string     `json:"guild_name,omitempty"`
}

// TimeParseCohortResponse is the full cohort for one bucket, fastest first.
type TimeParseCohortResponse struct {
	Cutoff         time.Time              `json:"cutoff"`
	WindowStart    *time.Time             `json:"window_start,omitempty"`
	LookbackDays   int32                  `json:"lookback_days"`
	Kind           TimeParseCohortKind    `json:"kind"`
	InstanceName   string                 `json:"instance_name"`
	EncounterName  string                 `json:"encounter_name,omitempty"`
	DifficultyName string                 `json:"difficulty_name"`
	MaxPlayers     int16                  `json:"max_players"`
	SampleSize     int                    `json:"sample_size"`
	Status         string                 `json:"status"`
	Entries        []TimeParseCohortEntry `json:"entries"`
}
