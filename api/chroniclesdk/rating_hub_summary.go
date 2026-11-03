package chroniclesdk

import "github.com/google/uuid"

// HubSummary is a public, tenant-wide snapshot for the live leaderboards overview.
type HubSummary struct {
	Instances            []RankingsInstanceSummary  `json:"instances"`
	LandingPreviews      []HubLandingPreview        `json:"landing_previews"`
	Realms               []HubRealm                 `json:"realms"`
	Encounters           []RankingsEncounterSummary `json:"encounters"`
	ProgressionBosses    []string                   `json:"progression_bosses"`
	RankingEncounterSets []RankingEncounterSet      `json:"ranking_encounter_sets"`
	Filters              []RankingsFilterClass      `json:"filters"`
	SelectedCohort       *HubSelectedCohort         `json:"selected_cohort"`
	GenerationID         *uuid.UUID                 `json:"generation_id"`
	Ratings              HubRatings                 `json:"ratings"`
	Performances         []RankingsEntry            `json:"performances"`
	Speedruns            []SpeedrunLeaderboardEntry `json:"speedruns"`
}

// HubLandingPreview contains published, bounded highlights for one instance cohort.
// Aggregate top-player DPS remains in HubSummary.Instances[].top_players.
// Statistics are unavailable here.
type HubLandingPreview struct {
	InstanceName   string                     `json:"instance_name"`
	DifficultyName string                     `json:"difficulty_name"`
	MaxPlayers     int16                      `json:"max_players"`
	Player         HubPlayerRatings           `json:"player"`
	Guild          HubGuildRatings            `json:"guild"`
	Speedruns      []SpeedrunLeaderboardEntry `json:"speedruns"`
}

type HubSelectedCohort struct {
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int16  `json:"max_players"`
}
type HubRealm struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}
type HubRatings struct {
	Raid   HubRatingBoard  `json:"raid"`
	Bosses []HubBossRating `json:"bosses"`
}
type HubBossRating struct {
	EncounterName string `json:"encounter_name"`
	HubRatingBoard
}
type HubRatingBoard struct {
	Player HubPlayerRatings `json:"player"`
	Guild  HubGuildRatings  `json:"guild"`
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

// Compact published score identities are sufficient for preview cards.
type HubPlayerRatingEntry struct {
	RealmID       uuid.UUID `json:"realm_id"`
	RealmName     string    `json:"realm_name"`
	PlayerGUID    string    `json:"player_guid"`
	PlayerName    string    `json:"player_name"`
	PlayerClass   string    `json:"player_class"`
	PlayerSpec    string    `json:"player_spec"`
	PlayerSubSpec string    `json:"player_sub_spec"`
	Score         float64   `json:"score"`
}
type HubGuildRatingEntry struct {
	RealmID   uuid.UUID `json:"realm_id"`
	RealmName string    `json:"realm_name"`
	GuildID   uuid.UUID `json:"guild_id"`
	GuildName string    `json:"guild_name"`
	Score     float64   `json:"score"`
}
