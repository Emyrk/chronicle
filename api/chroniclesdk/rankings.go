package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// RankingsInstanceSummary is a summary of DPS rankings for a single instance.
type RankingsInstanceSummary struct {
	InstanceName   string                      `json:"instance_name"`
	DifficultyName string                      `json:"difficulty_name"`
	MaxPlayers     int16                       `json:"max_players"`
	TotalKills     int64                       `json:"total_kills"`
	TopPlayers     []RankingsInstanceTopPlayer `json:"top_players"`
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
	ID             uuid.UUID `json:"id"`
	EncounterName  string    `json:"encounter_name"`
	InstanceName   string    `json:"instance_name"`
	PlayerGUID     string    `json:"player_guid"`
	PlayerName     string    `json:"player_name"`
	PlayerClass    string    `json:"player_class"`
	PlayerSpec     string    `json:"player_spec"`
	PlayerRole     string    `json:"player_role"`
	PlayerLevel    int16     `json:"player_level"`
	DifficultyName string    `json:"difficulty_name"`
	MaxPlayers     int16     `json:"max_players"`
	SubSpec        *string   `json:"sub_spec,omitempty"`
	// TalentLayout is the player's talent build detected from the combat
	// log: one digit (rank) per talent per tree, trees separated by '}',
	// e.g. "05230...}30200...}0000". Empty when no build was detected.
	TalentLayout  *string   `json:"talent_layout,omitempty"`
	RealmID       uuid.UUID `json:"realm_id"`
	RealmName     string    `json:"realm_name"`
	GuildName     string    `json:"guild_name"`
	DamageDone    int64     `json:"damage_done"`
	HealingDone   int64     `json:"healing_done"`
	AbsorbedDone  int64     `json:"absorbed_done"`
	DurationSecs  float64   `json:"duration_secs"`
	DPS           float64   `json:"dps"`
	HPS           float64   `json:"hps"`
	AvgIlvl       *int16    `json:"avg_ilvl,omitempty"`
	LogHashedSlug string    `json:"log_hashed_slug"`
	KilledAt      time.Time `json:"killed_at"`
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

// KillTimeLeaderboardEntry is a single row in the kill time leaderboard.
type KillTimeLeaderboardEntry struct {
	EncounterName string    `json:"encounter_name"`
	InstanceName  string    `json:"instance_name"`
	GuildName     string    `json:"guild_name"`
	RealmName     string    `json:"realm_name"`
	DurationSecs  float64   `json:"duration_secs"`
	KilledAt      time.Time `json:"killed_at"`
	LogHashedSlug string    `json:"log_hashed_slug"`
}

// KillTimeLeaderboardResponse wraps kill time leaderboard entries with total count for pagination.
type KillTimeLeaderboardResponse struct {
	Entries    []KillTimeLeaderboardEntry `json:"entries"`
	TotalCount int64                      `json:"total_count"`
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

// ── Instance Parses ──────────────────────────────────────────────────────

// InstanceParsesResponse is the top-level response for the instance parses endpoint.
type InstanceParsesResponse struct {
	// Available is false when no published snapshot exists yet or parses
	// are disabled for this tenant.
	Available bool `json:"available"`

	// Reason explains why parses are unavailable (e.g. "disabled", "no_snapshot").
	// Empty when Available is true.
	Reason string `json:"reason,omitempty"`

	// Snapshot metadata (zero values when Available=false).
	SnapshotID   uuid.UUID `json:"snapshot_id"`
	Cutoff       time.Time `json:"cutoff"`
	LookbackDays int32     `json:"lookback_days"`
	CohortMode   string    `json:"cohort_mode"`

	// SelectedEncounters lists the encounter names that were requested.
	SelectedEncounters []string `json:"selected_encounters"`

	// Metric is "dps" or "hps".
	Metric string `json:"metric"`

	// ParseSource reports whether scores came from the persisted projection or
	// were calculated on demand. It is only populated for ?debug=true requests.
	ParseSource string `json:"parse_source,omitempty"`

	// Players contains one entry per unique player GUID in the instance.
	Players []InstanceParsePlayer `json:"players"`
}

// InstanceParsePlayer is a player's parse data across selected encounters.
type InstanceParsePlayer struct {
	PlayerGUID  string `json:"player_guid"`
	PlayerName  string `json:"player_name"`
	PlayerClass string `json:"player_class"`
	PlayerSpec  string `json:"player_spec"`
	PlayerRole  string `json:"player_role"`

	// Bosses contains per-encounter parse results for bosses this player killed.
	Bosses []InstanceParseBoss `json:"bosses"`

	// AverageParse is the mean of per-boss parse scores across killed selected bosses.
	// Nil when the player has no scored bosses.
	AverageParse *InstanceParseAverage `json:"average_parse"`

	// Status is empty string for normal, "unknown_spec" when spec mode can't score,
	// or "sample_too_small" when all bosses have too-small cohorts.
	Status string `json:"status,omitempty"`
	// Reason provides a human-readable explanation for the status.
	Reason string `json:"reason,omitempty"`
}

// InstanceParseBoss is a player's parse result for a single boss encounter.
type InstanceParseBoss struct {
	EncounterName string  `json:"encounter_name"`
	MetricValue   float64 `json:"metric_value"`
	PreciseScore  float64 `json:"precise_score"`
	DisplayScore  int     `json:"display_score"`
	Rank          int     `json:"rank"`
	SampleSize    int     `json:"sample_size"`
	// Status: "ok", "low_confidence", "sample_too_small".
	Status string `json:"status"`
}

// InstanceParseAverage is the average parse across multiple bosses.
type InstanceParseAverage struct {
	PreciseScore float64 `json:"precise_score"`
	DisplayScore int     `json:"display_score"`
	Killed       int     `json:"killed"`
	Selected     int     `json:"selected"`
}

// AdminTriggerSnapshotRequest is the request body for the admin parse snapshot trigger.
type AdminTriggerSnapshotRequest struct {
	// TenantID scopes the snapshot to a specific tenant. Empty = root/all-time scope.
	// Ignored when AllTenants is true.
	TenantID string `json:"tenant_id"`
	// AllTenants enqueues one job per non-disabled tenant (plus root), each
	// using the tenant's own ParseConfig lookback windows. When true, TenantID
	// is ignored and LookbackDays serves as the default for tenants without
	// explicit AllowedLookbackDays.
	AllTenants bool `json:"all_tenants"`
	// LookbackDays overrides the default lookback window. 0 = all-time.
	LookbackDays int32 `json:"lookback_days"`
	// Day is the snapshot cutoff date as YYYY-MM-DD. Empty = today.
	// The snapshot window is [cutoff - lookback, cutoff), so a backfilled
	// July 1 snapshot contains only pre-July-1 kills even if run today.
	Day string `json:"day"`
}

// AdminTriggerSnapshotJobResult describes a single enqueued snapshot job.
type AdminTriggerSnapshotJobResult struct {
	TenantID     string `json:"tenant_id"`
	LookbackDays int32  `json:"lookback_days"`
	JobID        int64  `json:"job_id"`
	JobState     string `json:"job_state"`
}

// AdminTriggerSnapshotResponse is returned when snapshot publication jobs are enqueued.
type AdminTriggerSnapshotResponse struct {
	// Jobs lists every enqueued job. For single-tenant requests this has one entry.
	Jobs []AdminTriggerSnapshotJobResult `json:"jobs"`
}

// AdminRefreshRankingsJob describes one tenant summary refresh job.
type AdminRefreshRankingsJob struct {
	TenantID string `json:"tenant_id"`
	JobID    int64  `json:"job_id"`
	JobState string `json:"job_state"`
}

// AdminRefreshRankingsResponse is returned when summary refresh jobs are enqueued.
type AdminRefreshRankingsResponse struct {
	Jobs []AdminRefreshRankingsJob `json:"jobs"`
}

// AdminSnapshotSummary is a snapshot listed in the admin parsing tab.
type AdminSnapshotSummary struct {
	ID            uuid.UUID  `json:"id"`
	TenantID      uuid.UUID  `json:"tenant_id"`
	TenantName    string     `json:"tenant_name"`
	Cutoff        time.Time  `json:"cutoff"`
	LookbackDays  int32      `json:"lookback_days"`
	CohortMode    string     `json:"cohort_mode"`
	PolicyVersion int16      `json:"policy_version"`
	QueryVersion  int16      `json:"query_version"`
	MemberCount   int64      `json:"member_count"`
	Status        string     `json:"status"`
	PublishedAt   *time.Time `json:"published_at"`
	CreatedAt     time.Time  `json:"created_at"`
}

// AdminBulkDeleteSnapshotsRequest is the request body for bulk snapshot deletion.
type AdminBulkDeleteSnapshotsRequest struct {
	IDs []uuid.UUID `json:"ids"`
}

// AdminBulkDeleteSnapshotsResponse is the response for bulk snapshot deletion.
type AdminBulkDeleteSnapshotsResponse struct {
	Deleted int `json:"deleted"`
}

// AdminTimeParseSnapshotSummary is a time-parse snapshot listed in the admin tab.
type AdminTimeParseSnapshotSummary struct {
	ID                uuid.UUID  `json:"id"`
	TenantID          uuid.UUID  `json:"tenant_id"`
	TenantName        string     `json:"tenant_name"`
	Cutoff            time.Time  `json:"cutoff"`
	WindowStart       *time.Time `json:"window_start"`
	LookbackDays      int32      `json:"lookback_days"`
	PolicyVersion     int16      `json:"policy_version"`
	QueryVersion      int16      `json:"query_version"`
	ClearMemberCount  int64      `json:"clear_member_count"`
	BossMemberCount   int64      `json:"boss_member_count"`
	Status            string     `json:"status"`
	SourceRowCount    int64      `json:"source_row_count"`
	SourceWatermark   *time.Time `json:"source_watermark"`
	SourceFingerprint int64      `json:"source_fingerprint"`
	PublishedAt       *time.Time `json:"published_at"`
	CreatedAt         time.Time  `json:"created_at"`
}

// ── Cohort Viewer (debugging) ────────────────────────────────────────────

// SnapshotSummary is a published snapshot listed for the cohort viewer.
type SnapshotSummary struct {
	ID            uuid.UUID `json:"id"`
	Cutoff        time.Time `json:"cutoff"`
	LookbackDays  int32     `json:"lookback_days"`
	CohortMode    string    `json:"cohort_mode"`
	PolicyVersion int16     `json:"policy_version"`
	MemberCount   int64     `json:"member_count"`
	PublishedAt   time.Time `json:"published_at"`
}

// CohortBucket describes one available (encounter, class, spec, difficulty, max_players) combination.
type CohortBucket struct {
	EncounterName  string `json:"encounter_name"`
	PlayerClass    string `json:"player_class"`
	PlayerSpec     string `json:"player_spec"`
	DifficultyName string `json:"difficulty_name"`
	MaxPlayers     int16  `json:"max_players"`
}

// CohortDebugEntry is a single datapoint in the cohort debug view.
type CohortDebugEntry struct {
	Rank          int       `json:"rank"`
	PlayerName    string    `json:"player_name"`
	PlayerGUID    string    `json:"player_guid"`
	MetricValue   float64   `json:"metric_value"`
	DisplayScore  int       `json:"display_score"`
	PreciseScore  float64   `json:"precise_score"`
	KilledAt      time.Time `json:"killed_at"`
	LogHashedSlug string    `json:"log_hashed_slug"`
}

// CohortDebugResponse is the response for the cohort debug endpoint.
type CohortDebugResponse struct {
	SnapshotID    uuid.UUID          `json:"snapshot_id"`
	EncounterName string             `json:"encounter_name"`
	PlayerClass   string             `json:"player_class"`
	PlayerSpec    string             `json:"player_spec"`
	Metric        string             `json:"metric"`
	TotalKills    int                `json:"total_kills"`
	MinValue      float64            `json:"min_value"`
	MaxValue      float64            `json:"max_value"`
	MedianValue   float64            `json:"median_value"`
	Entries       []CohortDebugEntry `json:"entries"`
	Buckets       []CohortBucket     `json:"buckets"`
}
