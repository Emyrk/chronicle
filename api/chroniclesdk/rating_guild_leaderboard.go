package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

// GuildRatingBossLeaderboardResponse lists published guild scores for one exact boss cohort.
type GuildRatingBossLeaderboardResponse struct {
	Entries []GuildRatingBossLeaderboardEntry `json:"entries"`
}

type GuildRatingBossLeaderboardEntry struct {
	GenerationID    uuid.UUID  `json:"generation_id"`
	GroupID         uuid.UUID  `json:"group_id"`
	RealmID         uuid.UUID  `json:"realm_id"`
	GuildID         uuid.UUID  `json:"guild_id"`
	InstanceName    string     `json:"instance_name"`
	EncounterName   string     `json:"encounter_name"`
	DifficultyName  string     `json:"difficulty_name"`
	MaxPlayers      int16      `json:"max_players"`
	RatingMetric    string     `json:"rating_metric"`
	WindowKind      string     `json:"window_kind"`
	WindowStart     *time.Time `json:"window_start,omitempty"`
	WindowEnd       *time.Time `json:"window_end,omitempty"`
	Score           float64    `json:"score"`
	BestRaw         *float64   `json:"best_raw,omitempty"`
	RankOneRaw      *float64   `json:"rank_one_raw,omitempty"`
	BestLockedParse *float64   `json:"best_locked_parse,omitempty"`
	Form            *float64   `json:"form,omitempty"`
	FloorScore      *float64   `json:"floor_score,omitempty"`
	EligibleKills   int32      `json:"eligible_kills"`
	ComputedAt      *time.Time `json:"computed_at,omitempty"`
}

// GuildRatingScopeLeaderboardResponse lists published guild scores for an exact raid or global cohort.
type GuildRatingScopeLeaderboardResponse struct {
	Scope   string                             `json:"scope"` // raid or global
	Entries []GuildRatingScopeLeaderboardEntry `json:"entries"`
}

type GuildRatingScopeLeaderboardEntry struct {
	GenerationID   uuid.UUID  `json:"generation_id"`
	GroupID        uuid.UUID  `json:"group_id"`
	RealmID        uuid.UUID  `json:"realm_id"`
	GuildID        uuid.UUID  `json:"guild_id"`
	InstanceName   string     `json:"instance_name"`
	DifficultyName string     `json:"difficulty_name"`
	MaxPlayers     int16      `json:"max_players"`
	RatingMetric   string     `json:"rating_metric"`
	WindowKind     string     `json:"window_kind"`
	Score          float64    `json:"score"`
	ComputedAt     *time.Time `json:"computed_at,omitempty"`
}
