package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// RankingsInstanceSummary is a summary of DPS rankings for a single instance.
type RankingsInstanceSummary struct {
	InstanceName string                        `json:"instance_name"`
	TotalKills   int64                         `json:"total_kills"`
	TopPlayers   []RankingsInstanceTopPlayer    `json:"top_players"`
}

// RankingsInstanceTopPlayer is a top-performing player for an instance summary.
type RankingsInstanceTopPlayer struct {
	PlayerName  string  `json:"player_name"`
	RealmName   string  `json:"realm_name"`
	PlayerClass string  `json:"player_class"`
	DPS         float64 `json:"dps"`
}

// RankingsEncounterSummary is a summary of rankings for one encounter within an instance.
type RankingsEncounterSummary struct {
	EncounterName string  `json:"encounter_name"`
	TotalKills    int64   `json:"total_kills"`
	TopDPS        float64 `json:"top_dps"`
}

// RankingsEntry is a single row in the DPS rankings leaderboard.
type RankingsEntry struct {
	ID            uuid.UUID  `json:"id"`
	EncounterName string     `json:"encounter_name"`
	InstanceName  string     `json:"instance_name"`
	PlayerGUID    string     `json:"player_guid"`
	PlayerName    string     `json:"player_name"`
	PlayerClass   string     `json:"player_class"`
	PlayerSpec    string     `json:"player_spec"`
	PlayerRole    string     `json:"player_role"`
	PlayerLevel    int16      `json:"player_level"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int16     `json:"max_players"`
	SubSpec        *string   `json:"sub_spec,omitempty"`
	RealmID       uuid.UUID  `json:"realm_id"`
	RealmName     string     `json:"realm_name"`
	GuildName     string     `json:"guild_name"`
	DamageDone    int64      `json:"damage_done"`
	DurationSecs  float64    `json:"duration_secs"`
	DPS           float64    `json:"dps"`
	AvgIlvl       *int16     `json:"avg_ilvl,omitempty"`
	LogHashedSlug string     `json:"log_hashed_slug"`
	KilledAt      time.Time  `json:"killed_at"`
}

// RankingsLeaderboardResponse wraps leaderboard entries with total count for pagination.
type RankingsLeaderboardResponse struct {
	Entries    []RankingsEntry `json:"entries"`
	TotalCount int64           `json:"total_count"`
}

// RankingsBoxPlotStats contains box plot statistics for a class/spec combination.
type RankingsBoxPlotStats struct {
	PlayerClass string  `json:"player_class"`
	PlayerSpec  string  `json:"player_spec"`
	MinDPS      float64 `json:"min_dps"`
	Q1DPS       float64 `json:"q1_dps"`
	MedianDPS   float64 `json:"median_dps"`
	Q3DPS       float64 `json:"q3_dps"`
	MaxDPS      float64 `json:"max_dps"`
	Count       int64   `json:"count"`
}

// RankingsKillTimeStats contains box plot statistics for encounter kill durations.
type RankingsKillTimeStats struct {
	EncounterName string  `json:"encounter_name"`
	MinSecs       float64 `json:"min_secs"`
	Q1Secs        float64 `json:"q1_secs"`
	MedianSecs    float64 `json:"median_secs"`
	Q3Secs        float64 `json:"q3_secs"`
	MaxSecs       float64 `json:"max_secs"`
	Count         int64   `json:"count"`
}

// RankingsSuccessRate contains kill/wipe counts for an encounter.
type RankingsSuccessRate struct {
	EncounterName string `json:"encounter_name"`
	Kills         int64  `json:"kills"`
	Wipes         int64  `json:"wipes"`
	Total         int64  `json:"total"`
}

// TalentBuild represents a unique talent tree layout, nameable for sub-spec grouping.
type TalentBuild struct {
	ID            uuid.UUID `json:"id"`
	PlayerClass   string    `json:"player_class"`
	Spec          string    `json:"spec"`
	SubSpec       *string   `json:"sub_spec,omitempty"`
	TalentSummary []int16   `json:"talent_summary"`
	TalentLayout  string    `json:"talent_layout"`
}

// TopPlayersFromJSON parses the JSON array of top players from the database query.
func TopPlayersFromJSON(data json.RawMessage) []RankingsInstanceTopPlayer {
	var players []RankingsInstanceTopPlayer
	if err := json.Unmarshal(data, &players); err != nil {
		return nil
	}
	return players
}
