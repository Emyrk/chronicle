package chroniclesdk

import (
	"github.com/google/uuid"
)

type HubBossRating struct {
	HubRatingBoard
	EncounterName string `json:"encounter_name"`
}

type HubRatingBoard struct {
	Player HubPlayerRatings `json:"player"`
	Guild  HubGuildRatings  `json:"guild"`
}

type HubRatings struct {
	Raid   HubRatingBoard  `json:"raid"`
	Bosses []HubBossRating `json:"bosses"`
}

type HubRealm struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type HubSelectedCohort struct {
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int64  `json:"max_players"`
}

type HubSetBoardMastery struct {
	Peak          float64 `json:"peak"`
	Form          float64 `json:"form"`
	Floor         float64 `json:"floor"`
	EligibleKills int64   `json:"eligible_kills"`
}

type HubSetBoardPeakComponent struct {
	EncounterName string  `json:"encounter_name"`
	Score         float64 `json:"score"`
}

type HubSetBoardResponse struct {
	Rows        []HubSetBoardRow `json:"rows"`
	Total       int64            `json:"total"`
	Page        int64            `json:"page"`
	HasNextPage bool             `json:"has_next_page"`
}

type HubSetBoardRow struct {
	Rank          int64     `json:"rank"`
	RealmID       uuid.UUID `json:"realm_id"`
	RealmName     string    `json:"realm_name"`
	SubjectID     uuid.UUID `json:"subject_id"`
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
