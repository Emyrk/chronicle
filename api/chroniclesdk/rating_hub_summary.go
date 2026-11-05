package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

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
// Performances are each player's best complete run, aggregated across its encounters.
// Aggregate top-player DPS remains separately in HubSummary.Instances[].top_players.
// Statistics are per-run DPS distributions by class/spec, from the v1 box plot.
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
	// PeakRaw is the DPS or HPS behind a Peak score: the kill's on a boss board,
	// the mean of the player's best per boss on a raid board. Unset otherwise.
	PeakRaw *float64 `json:"peak_raw,omitempty"`
}
type HubGuildRatingEntry struct {
	RealmID   uuid.UUID `json:"realm_id"`
	RealmName string    `json:"realm_name"`
	GuildID   uuid.UUID `json:"guild_id"`
	GuildName string    `json:"guild_name"`
	Score     float64   `json:"score"`
}

// HubSetBoardRow is one ranked subject on a chosen-boss board. Peak and Ranked
// Mastery average over the chosen bosses (a missed one is 0); Renown sums.
type HubSetBoardRow struct {
	Rank          int64     `json:"rank"`
	RealmID       uuid.UUID `json:"realm_id"`
	RealmName     string    `json:"realm_name"`
	SubjectID     string    `json:"subject_id"`
	Name          string    `json:"name"`
	GuildName     string    `json:"guild_name"`
	PlayerClass   string    `json:"player_class"`
	PlayerSpec    string    `json:"player_spec"`
	PlayerSubSpec string    `json:"player_sub_spec"`
	// Score is the ranked metric's; Peak, Mastery, and Renown are all three.
	Score   float64 `json:"score"`
	Peak    float64 `json:"peak"`
	Mastery float64 `json:"mastery"`
	Renown  float64 `json:"renown"`
	// PeakRaw is the Peak's duration-weighted DPS/HPS; unset when unknown.
	PeakRaw *float64 `json:"peak_raw,omitempty"`
	// PeakComponents lists the chosen boss scores behind a player Peak average.
	PeakComponents []HubSetBoardPeakComponent `json:"peak_components,omitempty"`
	// Mastery is Ranked Mastery's parts over the chosen bosses (a missed boss
	// counts as 0) and the eligible kills behind it; unset without a Mastery score.
	MasteryParts *HubSetBoardMastery `json:"mastery_parts,omitempty"`
}

// HubSetBoardPeakComponent is one chosen boss's Peak score in the average.
// A missed boss has score zero.
type HubSetBoardPeakComponent struct {
	EncounterName string  `json:"encounter_name"`
	Score         float64 `json:"score"`
}

// HubSetBoardMastery is the Peak, Form, and Floor a Ranked Mastery score is built from.
type HubSetBoardMastery struct {
	Peak          float64 `json:"peak"`
	Form          float64 `json:"form"`
	Floor         float64 `json:"floor"`
	EligibleKills int64   `json:"eligible_kills"`
}

// HubSetBoardResponse is a page of a chosen-boss board. Ranks cover the whole
// cohort; realm and search filters only narrow the displayed rows.
type HubSetBoardResponse struct {
	Rows        []HubSetBoardRow `json:"rows"`
	Total       int64            `json:"total"`
	Page        int              `json:"page"`
	HasNextPage bool             `json:"has_next_page"`
}

// AdminRatingRebuildJob is one tenant rating rebuild job from River, with the
// worker's last progress snapshot.
type AdminRatingRebuildJob struct {
	ID          int64      `json:"id"`
	State       string     `json:"state"`
	Attempt     int16      `json:"attempt"`
	TenantID    string     `json:"tenant_id"`
	TenantName  string     `json:"tenant_name"`
	CreatedAt   time.Time  `json:"created_at"`
	AttemptedAt *time.Time `json:"attempted_at,omitempty"`
	FinalizedAt *time.Time `json:"finalized_at,omitempty"`
	// DurationSeconds is the rebuild's elapsed time: the worker's recorded
	// elapsed time when it has one, else creation to finish (or to now).
	DurationSeconds float64 `json:"duration_seconds"`
	// Slow marks a job over twice the median of the listed finished rebuilds.
	Slow           bool    `json:"slow"`
	Phase          string  `json:"phase,omitempty"`
	Status         string  `json:"status,omitempty"`
	PagesProcessed int64   `json:"pages_processed,omitempty"`
	PagesPerSecond float64 `json:"pages_per_second,omitempty"`
	LastError      string  `json:"last_error,omitempty"`
}

// AdminRatingRebuildJobsResponse lists recent rebuilds, newest first.
type AdminRatingRebuildJobsResponse struct {
	Jobs []AdminRatingRebuildJob `json:"jobs"`
	// MedianSeconds is the median duration of the listed finished rebuilds.
	MedianSeconds float64 `json:"median_seconds"`
}
