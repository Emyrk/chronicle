package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

type HubPlayerRatingEntry struct {
	RealmID       uuid.UUID `json:"realm_id"`
	RealmName     string    `json:"realm_name"`
	PlayerGUID    string    `json:"player_guid"`
	PlayerName    string    `json:"player_name"`
	PlayerClass   string    `json:"player_class"`
	PlayerSpec    string    `json:"player_spec"`
	PlayerSubSpec string    `json:"player_sub_spec"`
	Score         float64   `json:"score"`
	PeakRaw       *float64  `json:"peak_raw,omitempty"`
}
type HubGuildRatingEntry struct {
	RealmID   uuid.UUID `json:"realm_id"`
	RealmName string    `json:"realm_name"`
	GuildID   uuid.UUID `json:"guild_id"`
	GuildName string    `json:"guild_name"`
	Score     float64   `json:"score"`
}
type HubPlayerRatings struct {
	Peak          []HubPlayerRatingEntry `json:"peak"`
	RankedMastery []HubPlayerRatingEntry `json:"ranked_mastery"`
	Renown        []HubPlayerRatingEntry `json:"renown"`
}
type HubGuildRatings struct {
	Peak          []HubGuildRatingEntry `json:"peak"`
	RankedMastery []HubGuildRatingEntry `json:"ranked_mastery"`
	Renown        []HubGuildRatingEntry `json:"renown"`
}
type HubLandingPreview struct {
	InstanceName   string                     `json:"instance_name"`
	DifficultyName string                     `json:"difficulty_name"`
	MaxPlayers     int16                      `json:"max_players"`
	Player         HubPlayerRatings           `json:"player"`
	Guild          HubGuildRatings            `json:"guild"`
	Performances   []RankingsEntry            `json:"performances"`
	Statistics     []RankingsBoxPlotStats     `json:"statistics"`
	Speedruns      []SpeedrunLeaderboardEntry `json:"speedruns"`
}
type LeaderboardHighlightSnapshot struct {
	InstanceName             string     `json:"instance_name"`
	DifficultyName           string     `json:"difficulty_name"`
	MaxPlayers               int16      `json:"max_players"`
	Status                   string     `json:"status"`
	RefreshedAt              *time.Time `json:"refreshed_at,omitempty"`
	ConfigurationFingerprint string     `json:"configuration_fingerprint"`
}
type LeaderboardHighlightsResponse struct {
	Status          string                         `json:"status"`
	LandingPreviews []HubLandingPreview            `json:"landing_previews"`
	Snapshots       []LeaderboardHighlightSnapshot `json:"snapshots"`
}
type RefreshLeaderboardHighlightsRequest struct {
	TenantID uuid.UUID `json:"tenant_id"`
}
