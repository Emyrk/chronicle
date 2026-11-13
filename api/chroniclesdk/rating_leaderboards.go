package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type GuildRatingBossLeaderboardEntry struct {
	GenerationID    uuid.UUID  `json:"generation_id"`
	GroupID         uuid.UUID  `json:"group_id"`
	RealmID         uuid.UUID  `json:"realm_id"`
	GuildID         uuid.UUID  `json:"guild_id"`
	InstanceName    string     `json:"instance_name"`
	EncounterName   string     `json:"encounter_name"`
	DifficultyName  string     `json:"difficulty_name"`
	MaxPlayers      int64      `json:"max_players"`
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
	EligibleKills   int64      `json:"eligible_kills"`
	ComputedAt      *time.Time `json:"computed_at,omitempty"`
}

type GuildRatingBossLeaderboardResponse struct {
	Entries []GuildRatingBossLeaderboardEntry `json:"entries"`
}

type GuildRatingScopeLeaderboardEntry struct {
	GenerationID   uuid.UUID  `json:"generation_id"`
	GroupID        uuid.UUID  `json:"group_id"`
	RealmID        uuid.UUID  `json:"realm_id"`
	GuildID        uuid.UUID  `json:"guild_id"`
	InstanceName   string     `json:"instance_name"`
	DifficultyName string     `json:"difficulty_name"`
	MaxPlayers     int64      `json:"max_players"`
	RatingMetric   string     `json:"rating_metric"`
	WindowKind     string     `json:"window_kind"`
	Score          float64    `json:"score"`
	ComputedAt     *time.Time `json:"computed_at,omitempty"`
}

type GuildRatingScopeLeaderboardResponse struct {
	Scope   string                             `json:"scope"` // raid or global
	Entries []GuildRatingScopeLeaderboardEntry `json:"entries"`
}

type RatingBossLeaderboardEntry struct {
	GenerationID      uuid.UUID  `json:"generation_id"`
	GroupID           uuid.UUID  `json:"group_id"`
	RealmID           uuid.UUID  `json:"realm_id"`
	PlayerGUID        string     `json:"player_guid"`
	InstanceName      string     `json:"instance_name"`
	EncounterName     string     `json:"encounter_name"`
	DifficultyName    string     `json:"difficulty_name"`
	MaxPlayers        int64      `json:"max_players"`
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
	EligibleKills     int64      `json:"eligible_kills"`
	ComputedAt        *time.Time `json:"computed_at,omitempty"`
}

type RatingBossLeaderboardResponse struct {
	Entries []RatingBossLeaderboardEntry `json:"entries"`
}

type RatingEligibleBoss struct {
	InstanceName  string `json:"instance_name"`
	EncounterName string `json:"encounter_name"`
}

type RatingRealmGroup struct {
	ID             uuid.UUID               `json:"id"`
	ServerID       uuid.UUID               `json:"server_id"`
	Name           string                  `json:"name"`
	Realms         []RatingRealmGroupRealm `json:"realms"`
	EligibleBosses []RatingEligibleBoss    `json:"eligible_bosses"`
}

type RatingRealmGroupRealm struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type RatingRealmGroupsResponse struct {
	Groups []RatingRealmGroup `json:"groups"`
}

type RatingScopeLeaderboardEntry struct {
	GenerationID      uuid.UUID  `json:"generation_id"`
	GroupID           uuid.UUID  `json:"group_id"`
	RealmID           uuid.UUID  `json:"realm_id"`
	PlayerGUID        string     `json:"player_guid"`
	InstanceName      string     `json:"instance_name"`
	DifficultyName    string     `json:"difficulty_name"`
	MaxPlayers        int64      `json:"max_players"`
	PlayerClass       string     `json:"player_class"`
	PlayerSpec        string     `json:"player_spec"`
	PlayerSubSpec     string     `json:"player_sub_spec"`
	PerformanceMetric string     `json:"performance_metric"`
	RatingMetric      string     `json:"rating_metric"`
	WindowKind        string     `json:"window_kind"`
	Score             float64    `json:"score"`
	ComputedAt        *time.Time `json:"computed_at,omitempty"`
}

type RatingScopeLeaderboardResponse struct {
	Scope   string                        `json:"scope"` // raid or global
	Entries []RatingScopeLeaderboardEntry `json:"entries"`
}
