package chroniclesdk

import "time"

// CareerPlayerResponse keeps each exact specialization independent, including Renown.
// Collections are serialized as arrays, never null. Status is descriptive, not a score.
type CareerPlayerResponse struct {
	Status          string               `json:"status"`
	Cohorts         []CareerPlayerCohort `json:"cohorts"`
	PoolFingerprint string               `json:"pool_fingerprint"`
	Issues          []CareerIssue        `json:"issues"`
}

type CareerPlayerCohort struct {
	PlayerClass   string        `json:"player_class"`
	PlayerSpec    string        `json:"player_spec"`
	PlayerSubSpec string        `json:"player_sub_spec"`
	Summary       CareerSummary `json:"summary"`
}

type CareerGuildResponse struct {
	Status          string        `json:"status"`
	Summary         CareerSummary `json:"summary"`
	PoolFingerprint string        `json:"pool_fingerprint"`
	Issues          []CareerIssue `json:"issues"`
}

// CareerSummary contains published components, never an opaque combined score.
// Null performance scores are unavailable, not zero. ChosenMetric is a stored
// player DPS/HPS choice (null before selection); guild kill-time scoring uses null.
type CareerSummary struct {
	Mastery           *float64             `json:"mastery"`
	Peak              *float64             `json:"peak"`
	Renown            float64              `json:"renown"`
	ChosenMetric      *string              `json:"chosen_metric"`
	PerformanceStatus string               `json:"performance_status"`
	ComputedAt        *time.Time           `json:"computed_at"`
	RefreshPending    bool                 `json:"refresh_pending"`
	Contributions     []CareerContribution `json:"contributions"`
}

// CareerContribution identifies an exact configured raid variant. Backend values
// already encode missing-subject zero contributions; clients must not recompute them.
type CareerContribution struct {
	InstanceName        string   `json:"instance_name"`
	DifficultyName      string   `json:"difficulty_name"`
	MaxPlayers          int16    `json:"max_players"`
	Weight              *float64 `json:"weight"`
	IncludeAverage      bool     `json:"include_average"`
	IncludeRenown       bool     `json:"include_renown"`
	Mastery             *float64 `json:"mastery"`
	Peak                *float64 `json:"peak"`
	Renown              float64  `json:"renown"`
	EligibleMetricKills int64    `json:"eligible_metric_kills"`
	EligibleRenownKills int64    `json:"eligible_renown_kills"`
}

type CareerIssue struct {
	InstanceName   string `json:"instance_name"`
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int16  `json:"max_players"`
	Code           string `json:"code"`
}

// CareerLeaderboardResponse ranks characters by career Mastery, Peak, or Renown.
// Mastery and Peak come from each character's spec with the highest Mastery;
// Renown adds up every spec. Status explains unavailable Mastery and Peak.
type CareerLeaderboardResponse struct {
	Status  string                   `json:"status"`
	Sort    string                   `json:"sort"`
	Total   int                      `json:"total"`
	Entries []CareerLeaderboardEntry `json:"entries"`
}

type CareerLeaderboardEntry struct {
	RealmID       string   `json:"realm_id"`
	RealmName     string   `json:"realm_name"`
	PlayerGUID    string   `json:"player_guid"`
	PlayerName    string   `json:"player_name"`
	PlayerClass   string   `json:"player_class"`
	GuildName     string   `json:"guild_name"`
	PlayerSpec    string   `json:"player_spec"`
	PlayerSubSpec string   `json:"player_sub_spec"`
	ChosenMetric  *string  `json:"chosen_metric"`
	Mastery       *float64 `json:"mastery"`
	Peak          *float64 `json:"peak"`
	Renown        float64  `json:"renown"`
}
