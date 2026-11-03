package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// Tenant rating leaderboards expose materialized scores, never a recomputed rank.
type TenantPlayerBossLeaderboardResponse struct {
	Entries    []TenantPlayerBossLeaderboardEntry `json:"entries"`
	NextCursor string                             `json:"next_cursor,omitempty"`
}
type TenantPlayerScopeLeaderboardResponse struct {
	Scope      string                              `json:"scope"`
	Entries    []TenantPlayerScopeLeaderboardEntry `json:"entries"`
	NextCursor string                              `json:"next_cursor,omitempty"`
}
type TenantGuildBossLeaderboardResponse struct {
	Entries    []TenantGuildBossLeaderboardEntry `json:"entries"`
	NextCursor string                            `json:"next_cursor,omitempty"`
}
type TenantGuildScopeLeaderboardResponse struct {
	Scope      string                             `json:"scope"`
	Entries    []TenantGuildScopeLeaderboardEntry `json:"entries"`
	NextCursor string                             `json:"next_cursor,omitempty"`
}

type TenantPlayerBossLeaderboardEntry struct {
	GenerationID      uuid.UUID  `json:"generation_id"`
	RealmID           uuid.UUID  `json:"realm_id"`
	PlayerGUID        string     `json:"player_guid"`
	InstanceName      string     `json:"instance_name"`
	EncounterName     string     `json:"encounter_name"`
	DifficultyName    string     `json:"difficulty_name"`
	MaxPlayers        int16      `json:"max_players"`
	PlayerClass       string     `json:"player_class"`
	PlayerSpec        string     `json:"player_spec"`
	PlayerSubSpec     string     `json:"player_sub_spec"`
	PerformanceMetric string     `json:"performance_metric"`
	RatingMetric      string     `json:"rating_metric"`
	WindowKind        string     `json:"window_kind"`
	WindowStart       *time.Time `json:"window_start,omitempty"`
	WindowEnd         *time.Time `json:"window_end,omitempty"`
	Score             float64    `json:"score"`
	BestRaw           *float64   `json:"best_raw,omitempty"`
	RankOneRaw        *float64   `json:"rank_one_raw,omitempty"`
	BestLockedParse   *float64   `json:"best_locked_parse,omitempty"`
	Form              *float64   `json:"form,omitempty"`
	FloorScore        *float64   `json:"floor_score,omitempty"`
	EligibleKills     int32      `json:"eligible_kills"`
	ComputedAt        *time.Time `json:"computed_at,omitempty"`
}
type TenantPlayerScopeLeaderboardEntry struct {
	GenerationID      uuid.UUID  `json:"generation_id"`
	RealmID           uuid.UUID  `json:"realm_id"`
	PlayerGUID        string     `json:"player_guid"`
	InstanceName      string     `json:"instance_name"`
	DifficultyName    string     `json:"difficulty_name"`
	MaxPlayers        int16      `json:"max_players"`
	PlayerClass       string     `json:"player_class"`
	PlayerSpec        string     `json:"player_spec"`
	PlayerSubSpec     string     `json:"player_sub_spec"`
	PerformanceMetric string     `json:"performance_metric"`
	RatingMetric      string     `json:"rating_metric"`
	WindowKind        string     `json:"window_kind"`
	Score             float64    `json:"score"`
	ComputedAt        *time.Time `json:"computed_at,omitempty"`
}
type TenantGuildBossLeaderboardEntry struct {
	GenerationID    uuid.UUID  `json:"generation_id"`
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
type TenantGuildScopeLeaderboardEntry struct {
	GenerationID   uuid.UUID  `json:"generation_id"`
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
