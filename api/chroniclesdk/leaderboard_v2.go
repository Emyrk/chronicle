package chroniclesdk

import (
	"github.com/google/uuid"
	"time"
)

// LeaderboardV2Response is a preview read over all-time raw summaries, not a
// claim that evidence ingestion or refresh workers are installed.
type LeaderboardV2Response struct {
	Maintenance    *LeaderboardMaintenance `json:"maintenance,omitempty"`
	Status         string                  `json:"status"`
	Message        string                  `json:"message"`
	Entries        []LeaderboardV2Entry    `json:"entries"`
	NextCursor     string                  `json:"next_cursor,omitempty"`
	IncludedBosses []string                `json:"included_bosses"`
}
type LeaderboardV2Entry struct {
	RealmName        string                  `json:"realm_name"`
	PeakCompanion    *LeaderboardV2Companion `json:"peak_companion"`
	MasteryCompanion *LeaderboardV2Companion `json:"mastery_companion"`
	PlayerClass      string                  `json:"player_class"`
	PlayerSpec       string                  `json:"player_spec"`
	PlayerSubSpec    string                  `json:"player_sub_spec"`
	RealmID          uuid.UUID               `json:"realm_id"`
	SubjectID        string                  `json:"subject_id"`
	Name             string                  `json:"name"`
	// SubjectClass is the character's class for display. It equals PlayerClass on
	// cohort boards and is looked up for Renown rows, which have no PlayerClass.
	SubjectClass string `json:"subject_class"`
	// GuildName is a player's current guild for display; empty for guilds and guildless players.
	GuildName string `json:"guild_name"`
	// LogoURL is a guild subject's page logo for display; empty for players and guilds without one.
	LogoURL     string              `json:"logo_url"`
	Score       float64             `json:"score"`
	Peak        float64             `json:"peak"`
	Form        float64             `json:"form"`
	Floor       float64             `json:"floor"`
	Bosses      []LeaderboardV2Boss `json:"bosses"`
	Mastery     float64             `json:"mastery"`
	Renown      float64             `json:"renown"`
	SampleCount int64               `json:"sample_count"`
	ComputedAt  time.Time           `json:"computed_at"`
}
type LeaderboardV2Cohort struct {
	PlayerClass   string `json:"player_class"`
	PlayerSpec    string `json:"player_spec"`
	PlayerSubSpec string `json:"player_sub_spec"`
	Metric        string `json:"metric"`
}

// LeaderboardV2Boss is page-bounded summary detail, never observation replay.
// Missing summaries have zero peak/count; unavailable raw values stay null.
type LeaderboardV2Boss struct {
	EncounterName    string   `json:"encounter_name"`
	Peak             float64  `json:"peak"`
	RawPeak          *float64 `json:"raw_peak"`
	DurationMS       *int64   `json:"duration_ms"`
	ObservationCount int64    `json:"observation_count"`
	// KilledAt is when the player's peak kill happened; absent for guilds and missing bosses.
	KilledAt *time.Time `json:"killed_at,omitempty"`
	// PeakLog is the peak kill's log instance (hashed slug or id) while it is listed; absent otherwise.
	PeakLog string `json:"peak_log,omitempty"`
}

// LeaderboardV2PlayerHistory is one character's canonical rating evidence,
// grouped by exact boss and cohort, for explaining how ratings are derived.
type LeaderboardV2PlayerHistory struct {
	Groups []LeaderboardV2PlayerHistoryGroup `json:"groups"`
	// Truncated is true when the character has more kills than one response returns.
	Truncated bool `json:"truncated"`
}

type LeaderboardV2PlayerHistoryGroup struct {
	InstanceName   string `json:"instance_name"`
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int16  `json:"max_players"`
	EncounterName  string `json:"encounter_name"`
	PlayerClass    string `json:"player_class"`
	PlayerSpec     string `json:"player_spec"`
	PlayerSubSpec  string `json:"player_sub_spec"`
	Metric         string `json:"metric"`
	// Benchmark is the cohort's current all-time best raw metric.
	Benchmark float64 `json:"benchmark"`
	// RenownAward is the current award for one kill of this boss variant.
	RenownAward float64 `json:"renown_award"`
	// RenownKills counts this character's kills of the boss across every cohort.
	RenownKills int64                            `json:"renown_kills"`
	Kills       []LeaderboardV2PlayerHistoryKill `json:"kills"`
}

type LeaderboardV2PlayerHistoryKill struct {
	KilledAt time.Time `json:"killed_at"`
	Value    float64   `json:"value"`
	// Parse is the kill's most recent parse score, when one exists.
	Parse *int16 `json:"parse,omitempty"`
}

// LeaderboardV2Companion identifies the winning whole-selection cohort.
type LeaderboardV2Companion struct {
	Score         float64 `json:"score"`
	PlayerClass   string  `json:"player_class"`
	PlayerSpec    string  `json:"player_spec"`
	PlayerSubSpec string  `json:"player_sub_spec"`
}
