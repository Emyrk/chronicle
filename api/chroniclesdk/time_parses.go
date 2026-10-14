package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// InstanceTimeParsesResponse contains time-based parse scores for a specific
// instance. Clear time uses the published snapshot population, while boss kill
// times use the current-known membership cohort bounded by the snapshot dates.
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

// TimeParseSnapshotSummary is a published time-parse snapshot for the cohort
// viewer's snapshot picker.
type TimeParseSnapshotSummary struct {
	ID           uuid.UUID  `json:"id"`
	Cutoff       time.Time  `json:"cutoff"`
	WindowStart  *time.Time `json:"window_start,omitempty"`
	LookbackDays int32      `json:"lookback_days"`
	PublishedAt  time.Time  `json:"published_at"`
}

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

// TimeParseCohortBucketsResponse lists every bucket available in a snapshot.
type TimeParseCohortBucketsResponse struct {
	SnapshotID uuid.UUID               `json:"snapshot_id"`
	Buckets    []TimeParseCohortBucket `json:"buckets"`
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
	SnapshotID     uuid.UUID              `json:"snapshot_id"`
	Kind           TimeParseCohortKind    `json:"kind"`
	InstanceName   string                 `json:"instance_name"`
	EncounterName  string                 `json:"encounter_name,omitempty"`
	DifficultyName string                 `json:"difficulty_name"`
	MaxPlayers     int16                  `json:"max_players"`
	SampleSize     int                    `json:"sample_size"`
	Status         string                 `json:"status"`
	Entries        []TimeParseCohortEntry `json:"entries"`
}
