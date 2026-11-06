package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// CharacterPerformanceResponse contains canonical ranking runs for one selected
// instance variant and boss set.
type CharacterPerformanceResponse struct {
	PlayerGUID string                    `json:"player_guid"`
	Metric     string                    `json:"metric"`
	Runs       []CharacterPerformanceRun `json:"runs"`
}

// CharacterPerformanceRun aggregates all selected encounters from one persisted
// canonical ranking run. AverageParse is nil when any selected encounter lacks
// a usable cached parse.
type CharacterPerformanceRun struct {
	RunID                    uuid.UUID `json:"run_id"`
	RepresentativeInstanceID uuid.UUID `json:"representative_instance_id"`
	StartedAt                time.Time `json:"started_at"`
	KilledAt                 time.Time `json:"killed_at"`
	PlayerName               string    `json:"player_name"`
	PlayerClass              string    `json:"player_class"`
	PlayerSpec               string    `json:"player_spec"`
	PlayerSubSpec            string    `json:"player_sub_spec,omitempty"`
	EncounterCount           int       `json:"encounter_count"`
	DamageDone               int64     `json:"damage_done"`
	HealingDone              int64     `json:"healing_done"`
	AbsorbedDone             int64     `json:"absorbed_done"`
	PlayerDeaths             *int32    `json:"player_deaths,omitempty"`
	AlivePercentage          *float64  `json:"alive_percentage,omitempty"`
	DurationSecs             float64   `json:"duration_secs"`
	DPS                      float64   `json:"dps"`
	HPS                      float64   `json:"hps"`
	LogHashedSlug            string    `json:"log_hashed_slug"`
	AverageParse             *float64  `json:"average_parse,omitempty"`
}

// CharacterEncounterStatsResponse lists per-encounter kill aggregates for a
// character across all recorded logs (no lookback window).
type CharacterEncounterStatsResponse struct {
	PlayerGUID string                    `json:"player_guid"`
	Encounters []CharacterEncounterStats `json:"encounters"`
}

// CharacterEncounterStats aggregates one character's kills of one encounter.
// Duplicate uploads of the same raid night count once.
type CharacterEncounterStats struct {
	InstanceName   string    `json:"instance_name"`
	EncounterName  string    `json:"encounter_name"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int16     `json:"max_players"`
	Kills          int       `json:"kills"`
	FirstKilledAt  time.Time `json:"first_killed_at"`
	LastKilledAt   time.Time `json:"last_killed_at"`
}
