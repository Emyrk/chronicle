package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceTimeParsesResponse contains locked time-based parse scores for a
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

// AdminBackfillTimeParseScoresRequest configures one bounded historical score dispatcher job.
type AdminBackfillTimeParseScoresRequest struct {
	TenantID      string `json:"tenant_id,omitempty"`
	StartedAfter  string `json:"started_after,omitempty"`
	StartedBefore string `json:"started_before,omitempty"`
	BatchSize     int32  `json:"batch_size,omitempty"`
	Force         bool   `json:"force,omitempty"`
}

// AdminBackfillTimeParseScoresResponse identifies the enqueued dispatcher job.
type AdminBackfillTimeParseScoresResponse struct {
	JobID    int64  `json:"job_id"`
	JobState string `json:"job_state"`
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

// TimeParseTierCutoff is the slowest duration that still reaches a parse
// tier. DurationMs is nil when no run in the cohort reaches the tier.
type TimeParseTierCutoff struct {
	Floor      int    `json:"floor"`
	DurationMs *int64 `json:"duration_ms"`
}

// TimeParseSpread summarizes one boss-kill or clear-time cohort for public
// parse pages. Faster is better, so MinMs is the best run.
type TimeParseSpread struct {
	Kind           TimeParseCohortKind   `json:"kind"`
	EncounterName  string                `json:"encounter_name,omitempty"`
	DifficultyName string                `json:"difficulty_name"`
	MaxPlayers     int16                 `json:"max_players"`
	SampleSize     int                   `json:"sample_size"`
	Status         string                `json:"status"`
	MinMs          int64                 `json:"min_ms"`
	MedianMs       int64                 `json:"median_ms"`
	MaxMs          int64                 `json:"max_ms"`
	Cutoffs        []TimeParseTierCutoff `json:"cutoffs"`
}

// TimeParseSpreadsResponse lists every kill-time and clear-time cohort
// spread for one instance.
type TimeParseSpreadsResponse struct {
	Cutoff       time.Time         `json:"cutoff"`
	WindowStart  *time.Time        `json:"window_start,omitempty"`
	LookbackDays int32             `json:"lookback_days"`
	InstanceName string            `json:"instance_name"`
	Spreads      []TimeParseSpread `json:"spreads"`
}
