package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// CharacterParseHistoryResponse is the response for the character parse history endpoint.
// Returns ALL deduplicated parses over the lookback window, not just best per encounter.
type CharacterParseHistoryResponse struct {
	PlayerGUID  string           `json:"player_guid"`
	PlayerName  string           `json:"player_name"`
	PlayerClass string           `json:"player_class"`
	PlayerSpec  string           `json:"player_spec"`
	Metric      string           `json:"metric"`
	Score       *CharacterScore  `json:"score,omitempty"`
	Parses      []CharacterParse `json:"parses"`
}

// CharacterScore is the derived Score from best 3 parse scores per
// (instance_name, encounter_name) group, averaged per group, then averaged
// across groups.
type CharacterScore struct {
	Value           float64 `json:"value"`
	DisplayValue    int     `json:"display_value"`
	NumParses       int     `json:"num_parses"`
	EncounterGroups int     `json:"encounter_groups"`
}

// CharacterParse is a single deduplicated parse result for a character.
type CharacterParse struct {
	EncounterName  string     `json:"encounter_name"`
	InstanceName   string     `json:"instance_name"`
	DifficultyName string     `json:"difficulty_name"`
	MaxPlayers     int16      `json:"max_players"`
	InstanceID     uuid.UUID  `json:"instance_id"`
	SnapshotID     *uuid.UUID `json:"snapshot_id,omitempty"`
	RunID          uuid.UUID  `json:"run_id"`
	Metric         string     `json:"metric"`
	MetricValue    float64    `json:"metric_value"`
	PreciseScore   float64    `json:"precise_score"`
	DisplayScore   int        `json:"display_score"`
	Rank           int        `json:"rank"`
	SampleSize     int        `json:"sample_size"`
	Status         string     `json:"status"`
	KilledAt       time.Time  `json:"killed_at"`
}
