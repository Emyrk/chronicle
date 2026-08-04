package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// CharacterParseHistoryResponse is the response for the character parse history endpoint.
type CharacterParseHistoryResponse struct {
	PlayerGUID  string                   `json:"player_guid"`
	PlayerName  string                   `json:"player_name"`
	PlayerClass string                   `json:"player_class"`
	PlayerSpec  string                   `json:"player_spec"`
	Metric      string                   `json:"metric"`
	Score       *CharacterScore          `json:"score,omitempty"`
	Encounters  []CharacterEncounterBest `json:"encounters"`
}

// CharacterScore is the derived 60-day Score from best 3 parse percentiles
// per instance+encounter.
type CharacterScore struct {
	Value        float64 `json:"value"`
	DisplayValue int     `json:"display_value"`
	NumParses    int     `json:"num_parses"`
}

// CharacterEncounterBest is the best parse for a specific encounter.
type CharacterEncounterBest struct {
	EncounterName  string    `json:"encounter_name"`
	InstanceName   string    `json:"instance_name"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int16     `json:"max_players"`
	InstanceID     uuid.UUID `json:"instance_id"`
	SnapshotID     uuid.UUID `json:"snapshot_id"`
	Metric         string    `json:"metric"`
	MetricValue    float64   `json:"metric_value"`
	PreciseScore   float64   `json:"precise_score"`
	DisplayScore   int       `json:"display_score"`
	Rank           int       `json:"rank"`
	SampleSize     int       `json:"sample_size"`
	Status         string    `json:"status"`
	KilledAt       time.Time `json:"killed_at"`
}
