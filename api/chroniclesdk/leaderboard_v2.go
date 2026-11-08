package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// LeaderboardV2Response is a preview read over all-time raw summaries, not a
// claim that evidence ingestion or refresh workers are installed.
type LeaderboardV2Response struct {
	Maintenance    *LeaderboardMaintenance `json:"maintenance,omitempty"`
	Status         string                  `json:"status"`
	Message        string                  `json:"message"`
	Entries        []LeaderboardV2Entry    `json:"entries"`
	NextCursor     string                  `json:"next_cursor,omitempty"`
	IncludedBosses []string                `json:"included_bosses"`
}
type LeaderboardV2Entry struct {
	RealmName        string                  `json:"realm_name"`
	PeakCompanion    *LeaderboardV2Companion `json:"peak_companion"`
	MasteryCompanion *LeaderboardV2Companion `json:"mastery_companion"`
	PlayerClass      string                  `json:"player_class"`
	PlayerSpec       string                  `json:"player_spec"`
	PlayerSubSpec    string                  `json:"player_sub_spec"`
	RealmID          uuid.UUID               `json:"realm_id"`
	SubjectID        string                  `json:"subject_id"`
	Name             string                  `json:"name"`
	Score            float64                 `json:"score"`
	Peak             float64                 `json:"peak"`
	Form             float64                 `json:"form"`
	Floor            float64                 `json:"floor"`
	Bosses           []LeaderboardV2Boss     `json:"bosses"`
	Mastery          float64                 `json:"mastery"`
	Renown           float64                 `json:"renown"`
	SampleCount      int64                   `json:"sample_count"`
	ComputedAt       time.Time               `json:"computed_at"`
}
type LeaderboardV2Cohort struct {
	PlayerClass   string `json:"player_class"`
	PlayerSpec    string `json:"player_spec"`
	PlayerSubSpec string `json:"player_sub_spec"`
	Metric        string `json:"metric"`
}

// LeaderboardV2Boss is page-bounded summary detail, never observation replay.
// Missing summaries have zero peak/count; unavailable raw values stay null.
type LeaderboardV2Boss struct {
	EncounterName    string   `json:"encounter_name"`
	Peak             float64  `json:"peak"`
	RawPeak          *float64 `json:"raw_peak"`
	DurationMS       *int64   `json:"duration_ms"`
	ObservationCount int64    `json:"observation_count"`
}

// LeaderboardV2Companion identifies the winning whole-selection cohort.
type LeaderboardV2Companion struct {
	Score         float64 `json:"score"`
	PlayerClass   string  `json:"player_class"`
	PlayerSpec    string  `json:"player_spec"`
	PlayerSubSpec string  `json:"player_sub_spec"`
}
