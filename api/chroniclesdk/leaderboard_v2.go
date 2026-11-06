package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// LeaderboardV2Response is a preview read over all-time raw summaries, not a
// claim that evidence ingestion or refresh workers are installed.
type LeaderboardV2Response struct {
	Status         string               `json:"status"`
	Message        string               `json:"message"`
	Entries        []LeaderboardV2Entry `json:"entries"`
	NextCursor     string               `json:"next_cursor,omitempty"`
	IncludedBosses []string             `json:"included_bosses"`
}
type LeaderboardV2Entry struct {
	PlayerClass   string    `json:"player_class"`
	PlayerSpec    string    `json:"player_spec"`
	PlayerSubSpec string    `json:"player_sub_spec"`
	RealmID       uuid.UUID `json:"realm_id"`
	SubjectID     string    `json:"subject_id"`
	Name          string    `json:"name"`
	Score         float64   `json:"score"`
	Peak          float64   `json:"peak"`
	Mastery       float64   `json:"mastery"`
	Renown        float64   `json:"renown"`
	SampleCount   int64     `json:"sample_count"`
	ComputedAt    time.Time `json:"computed_at"`
}
type LeaderboardV2Cohort struct {
	PlayerClass   string `json:"player_class"`
	PlayerSpec    string `json:"player_spec"`
	PlayerSubSpec string `json:"player_sub_spec"`
	Metric        string `json:"metric"`
}
