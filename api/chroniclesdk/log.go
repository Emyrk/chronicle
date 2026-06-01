package chroniclesdk

import (
	"encoding/json"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type PeriodMoment struct {
	Timestamp   time.Time       `json:"timestamp"`
	Reason      string          `json:"reason"`
	MessageType string          `json:"message_type,omitempty"`
	Message     json.RawMessage `json:"message,omitempty"`
}

// EndState describes how an activity period ended
type EndState string

const (
	EndStateSlain   EndState = "slain"   // Unit was killed
	EndStateReset   EndState = "reset"   // Unit left combat without dying
	EndStateTimeout EndState = "timeout" // Inactivity timeout
)

type ActivityPeriod struct {
	Start      *PeriodMoment `json:"start,omitempty"`
	End        *PeriodMoment `json:"end,omitempty"`
	LastActive *PeriodMoment `json:"last_active,omitempty"`
	EndState   EndState      `json:"end_state,omitempty"`
}

type GUIDString = guid.GUID

type WoWLogGroup struct {
	ID        uuid.UUID          `json:"id"`
	Owner     uuid.UUID          `json:"owner"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
	UpdatedAt pgtype.Timestamptz `json:"updated_at"`
	LogType   string             `json:"log_type"`

	Files            []WoWLogFile    `json:"files"`
	ProcessingOutput json.RawMessage `json:"processing_output,omitempty"`
}

type WoWLogFile struct {
	ID                  uuid.UUID          `json:"id"`
	Owner               uuid.UUID          `json:"owner"`
	WowLogID            uuid.UUID          `json:"wow_log_id"`
	Hash                string             `json:"hash"`
	SizeBytes           int64              `json:"size_bytes"`
	MimeType            string             `json:"mime_type"`
	CompressedSizeBytes *int64             `json:"compressed_size_bytes,omitempty"`
	ContentEncoding     *string            `json:"content_encoding,omitempty"`
	CreatedAt           pgtype.Timestamptz `json:"created_at"`
	UpdatedAt           pgtype.Timestamptz `json:"updated_at"`
	StorageDeletedAt    pgtype.Timestamptz `json:"storage_deleted_at,omitempty"`
}

type Guild struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type WoWInstance struct {
	ID                uuid.UUID         `json:"id"`
	RealmID           uuid.UUID         `json:"realm_id"`
	// DatasetID is the resolved game-data dataset for this instance's realm.
	// Frontends use it to fetch matching talent/spell data regardless of the
	// tenant domain serving the request. Only populated on the detail endpoint.
	DatasetID         uuid.UUID         `json:"dataset_id,omitempty"`
	RealmName         string            `json:"realm_name,omitempty"`
	ServerName        string            `json:"server_name,omitempty"`
	TenantName        string            `json:"tenant_name,omitempty"`
	TenantSlug        string            `json:"tenant_slug,omitempty"`
	TenantIncludeAll  bool              `json:"tenant_include_in_all,omitempty"`
	LogGroupID        uuid.UUID         `json:"log_group_id"`
	Name              string            `json:"name"`
	Slug              string            `json:"slug"`
	StartTime         *time.Time        `json:"start_time,omitempty"`
	EndTime           *time.Time        `json:"end_time,omitempty"`
	Guild             *Guild            `json:"guild,omitempty"`
	Capabilities      []string          `json:"capabilities"`
	Versions          map[string]string `json:"versions"`
	RecorderName      string            `json:"recorder_name"`
	RecorderGUID      string            `json:"recorder_guid"`
	DuplicateGroupID  *uuid.UUID        `json:"duplicate_group_id,omitempty"`
	DifficultyName    string            `json:"difficulty_name"`
	MaxPlayers        int               `json:"max_players"`
	DynamicDifficulty int               `json:"dynamic_difficulty"`
}

// KillType represents the outcome of an encounter.
type KillType string

const (
	// KillTypeClean means all hostiles were killed - a complete victory.
	KillTypeClean KillType = "clean"
	// KillTypePartial means the boss was killed but adds remain alive.
	KillTypePartial KillType = "partial"
	// KillTypeWipe means the boss was not killed - raid wiped or reset.
	KillTypeWipe  KillType = "wipe"
	KillTypeReset KillType = "reset"
)

type WoWEncounter struct {
	ID         uuid.UUID   `json:"id"`
	InstanceID uuid.UUID   `json:"instance_id"`
	Boss       bool        `json:"boss"`
	Name       string      `json:"name"`
	KillType   KillType    `json:"kill_type"`
	Remaining  []guid.GUID `json:"remaining,omitempty"`
	StartTime  time.Time   `json:"start_time"`
	EndTime    time.Time   `json:"end_time"`
}

type WoWEncounterWithHostiles struct {
	WoWEncounter
	Hostiles []WoWEncounterHostile `json:"hostiles"`
}

type WoWEncounterHostile struct {
	ID      guid.GUID        `json:"id"`
	Boss    bool             `json:"boss"`
	Periods []ActivityPeriod `json:"periods"`
}

type WoWLogGroupState struct {
	WoWLogGroup

	Status JobStatus `json:"status"`
}

type WoWParsedLogJobOutput struct {
	Complete         *time.Time                `json:"complete"`
	InstanceFailures map[string]string         `json:"instance_failures"`
	Instances        []WoWSimpleParsedInstance `json:"instances"`

	// Report contains detailed timing and performance metrics for the parse job.
	Report *LogParseReport `json:"report,omitempty"`
}

// LogParseReport contains detailed timing breakdown for a log parse job.
type LogParseReport struct {
	TotalDuration    Duration `json:"total_duration_ms"`
	LoadFileDuration Duration `json:"load_file_duration_ms"`
	ParseDuration    Duration `json:"parse_duration_ms"`
	FinalizeDuration Duration `json:"finalize_duration_ms"`
	DBInsertDuration Duration `json:"db_insert_duration_ms"`

	TotalLines int64 `json:"total_lines"`

	// Instances contains per-instance timing breakdown.
	Instances []InstanceReport `json:"instances,omitempty"`

	// ConsumerTimes contains timing for each consumer (encounter detection, etc.)
	ConsumerTimes map[string]Duration `json:"consumer_times,omitempty"`

	// MissedSpells maps spell IDs not found in the DBC to their lookup count and name.
	MissedSpells map[int32]MissedSpell `json:"missed_spells,omitempty"`

	// Identity contains all creatures/spells seen, populated only when identity_mode is enabled.
	Identity *IdentityReport `json:"identity,omitempty"`
}

// MissedSpell holds the count and name of a spell not found in the DBC.
type MissedSpell struct {
	Count int    `json:"count"`
	Name  string `json:"name,omitempty"`
}

// InstanceReport contains timing details for a single parsed instance.
type InstanceReport struct {
	Name             string   `json:"name"`
	FinalizeDuration Duration `json:"finalize_duration_ms"`
	DBInsertDuration Duration `json:"db_insert_duration_ms"`
	EncounterCount   int      `json:"encounter_count"`
	// UnknownUnits maps creature entry IDs not in the hostiles map to name and hit count.
	UnknownUnits map[uint32]UnknownUnit `json:"unknown_units,omitempty"`
}

// UnknownUnit represents a creature entry not found in the hostiles map.
type UnknownUnit struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// IdentityReport contains all creatures and spells seen in a parsed log,
// organized by zone. Used for programming raid encounter definitions.
type IdentityReport struct {
	// ZonedUnits maps zone name → list of creatures seen in that zone.
	ZonedUnits map[string][]IdentityCreature `json:"zoned_units,omitempty"`
	// ZoneSpells maps zone name → list of spells seen in that zone.
	ZoneSpells map[string][]IdentitySpell `json:"zone_spells,omitempty"`
	// UnitSpells maps creature entry ID → list of spell names that creature cast.
	UnitSpells map[uint32][]string `json:"unit_spells,omitempty"`
	// GoCode contains generated Go source code for instance definitions.
	GoCode string `json:"go_code,omitempty"`
}

// IdentityCreature represents a creature seen during identity mode parsing.
type IdentityCreature struct {
	EntryID     uint32 `json:"entry_id"`
	Name        string `json:"name"`
	UniqueCount int    `json:"unique_count"`
}

// IdentitySpell represents a spell seen during identity mode parsing.
type IdentitySpell struct {
	SpellID int32 `json:"spell_id"`
	Count   int   `json:"count"`
}

// Duration wraps time.Duration for JSON serialization as milliseconds.
type Duration int64

// DurationFrom converts a time.Duration to Duration (milliseconds).
func DurationFrom(d time.Duration) Duration {
	return Duration(d.Milliseconds())
}

type WoWSimpleParsedInstance struct {
	WoWInstance
	Encounters []WoWEncounter `json:"encounters"`
}

type InstanceUnit struct {
	Name  string     `json:"name"`
	Owner *guid.GUID `json:"owner"`
	Entry uint32     `json:"entry"`
}

type InstancePlayer struct {
	Name  string            `json:"name"`
	Class types.HeroClasses `json:"class"`
	Race  types.HeroRaces   `json:"race"`
	Level int32             `json:"level"`
}

type WoWParsedInstance struct {
	WoWInstance
	RealmName  string                        `json:"realm_name,omitempty"`
	Encounters []WoWEncounterWithHostiles    `json:"encounters"`
	Units      map[GUIDString]InstanceUnit   `json:"units"`
	Players    map[GUIDString]InstancePlayer `json:"players"`
}

// SpeedrunRequirement describes one rule for a valid speedrun.
type SpeedrunRequirement struct {
	Name     string   `json:"name"`
	EntryIDs []uint32 `json:"entry_ids"`
	Count    int      `json:"count"`
	Category string   `json:"category"`
}

// SpeedrunKillRecord captures a single kill contributing to a requirement.
type SpeedrunKillRecord struct {
	EntryID   uint32    `json:"entry_id"`
	GUID      string    `json:"guid"`
	Timestamp time.Time `json:"timestamp"`
}

// SpeedrunProof ties a requirement to the kills that satisfied (or failed to satisfy) it.
type SpeedrunProof struct {
	Requirement SpeedrunRequirement  `json:"requirement"`
	Kills       []SpeedrunKillRecord `json:"kills"`
	Satisfied   bool                 `json:"satisfied"`
}

// SpeedrunLevelRangeRequirement constrains the player levels allowed in a qualifying speedrun.
type SpeedrunLevelRangeRequirement struct {
	MinLevel int32 `json:"min_level"`
	MaxLevel int32 `json:"max_level"`
}

// SpeedrunLevelViolation records a single player that violated the level range.
type SpeedrunLevelViolation struct {
	PlayerGUID guid.GUID `json:"player_guid"`
	PlayerName string    `json:"player_name"`
	Level      int32     `json:"level"`
}

// SpeedrunProofPayload is the JSON structure stored in the database proof column.
// It wraps the proof array alongside optional level range data.
type SpeedrunProofPayload struct {
	Proof      []SpeedrunProof        `json:"proof"`
	LevelRange *SpeedrunLevelRangeResult `json:"level_range,omitempty"`
}

// SpeedrunLevelRangeResult shows whether the level range was satisfied and who violated it.
type SpeedrunLevelRangeResult struct {
	Requirement SpeedrunLevelRangeRequirement `json:"requirement"`
	Satisfied   bool                          `json:"satisfied"`
	Violators   []SpeedrunLevelViolation      `json:"violators"`
}

// SpeedrunResult is the outcome of evaluating speedrun rules against an instance.
type SpeedrunResult struct {
	Qualified      bool                      `json:"qualified"`
	StartTime      time.Time                 `json:"start_time"`
	CompletionTime time.Time                 `json:"completion_time"`
	DurationMs     int64                     `json:"duration_ms"`
	Proof          []SpeedrunProof           `json:"proof"`
	VersionStatus    *SpeedrunVersionStatus      `json:"version_status,omitempty"`
	LevelRange       *SpeedrunLevelRangeResult   `json:"level_range,omitempty"`
	DataSourceStatus *SpeedrunDataSourceStatus   `json:"data_source,omitempty"`
}

// SpeedrunDataSourceStatus reports whether the instance has a valid data source
// (server-side capability or addon version) required for speedrun eligibility.
type SpeedrunDataSourceStatus struct {
	HasServerSide   bool `json:"has_server_side"`
	HasAddonVersion bool `json:"has_addon_version"`
	Eligible        bool `json:"eligible"`
}

// SpeedrunVersionStatus reports whether the instance's tooling versions
// meet the leaderboard minimum requirements.
type SpeedrunVersionStatus struct {
	ParserVersion    string `json:"parser_version"`
	MinParserVersion string `json:"min_parser_version"`
	ParserQualified  bool   `json:"parser_qualified"`
	AddonVersion     string `json:"addon_version"`
	MinAddonVersion  string `json:"min_addon_version"`
	AddonQualified   bool   `json:"addon_qualified"`
}

// SpeedrunLeaderboardEntry is one row in the leaderboard.
type SpeedrunLeaderboardEntry struct {
	InstanceID       uuid.UUID  `json:"instance_id"`
	Slug             string     `json:"slug"`
	DurationMs       int64      `json:"duration_ms"`
	GuildName        string     `json:"guild_name"`
	RealmName        string     `json:"realm_name"`
	StartTime        time.Time  `json:"start_time"`
	CompletionTime   time.Time  `json:"completion_time"`
	PlayerCount      int64      `json:"player_count"`
	GuildLogoURL     string     `json:"guild_logo_url,omitempty"`
	ParserVersion    string     `json:"parser_version"`
	AddonVersion     string     `json:"addon_version"`
	DuplicateGroupID *uuid.UUID `json:"duplicate_group_id,omitempty"`
}

// SpeedrunRulesResponse is the response for the speedrun rules endpoint.
type SpeedrunRulesResponse struct {
	InstanceName string                         `json:"instance_name"`
	Requirements []SpeedrunRequirement          `json:"requirements"`
	LevelRange   *SpeedrunLevelRangeRequirement `json:"level_range,omitempty"`
}

// LeaderboardVersionRequirements holds admin-configured minimum version
// thresholds for leaderboard filtering.
type LeaderboardVersionRequirements struct {
	InstanceName     string `json:"instance_name"`
	MinParserVersion string `json:"min_parser_version"`
	MinAddonVersion  string `json:"min_addon_version"`
}

// RecentInstancesResponse is the response for listing recently uploaded instances.
type RecentInstancesResponse struct {
	Instances  []RecentInstance `json:"instances"`
	NextCursor string           `json:"next_cursor,omitempty"`
	HasMore    bool             `json:"has_more"`
}

// RecentInstance represents a recent raid or dungeon instance.
type RecentInstance struct {
	ID                 uuid.UUID         `json:"id"`
	Slug               string            `json:"slug"`
	Name               string            `json:"name"`
	RealmID            uuid.UUID         `json:"realm_id"`
	RealmName          string            `json:"realm_name"`
	UploaderID         uuid.UUID         `json:"uploader_id"`
	UploaderName       string            `json:"uploader_name"`
	UploadedAt         time.Time         `json:"uploaded_at"`
	FirstEncounterTime time.Time         `json:"first_encounter_time"`
	PlayerCount        int64             `json:"player_count"`
	BossCount          int64             `json:"boss_count"`
	BossKills          int64             `json:"boss_kills"`
	DurationMs         *float64          `json:"duration_ms"` // nullable if no encounters
	GuildID            *uuid.UUID        `json:"guild_id,omitempty"`
	GuildName          *string           `json:"guild_name,omitempty"`
	Encounters         []RecentEncounter `json:"encounters,omitempty"`
	HasYoutubeVideo    bool              `json:"has_youtube_video"`
	DuplicateGroupID   *uuid.UUID        `json:"duplicate_group_id,omitempty"`
	RecorderName       string            `json:"recorder_name"`
	DifficultyName     string            `json:"difficulty_name"`
	MaxPlayers         int               `json:"max_players"`
	DynamicDifficulty  int               `json:"dynamic_difficulty"`
}

// RecentEncounter is a simplified encounter summary for the recent raids list.
type RecentEncounter struct {
	Name     string   `json:"name"`
	Boss     bool     `json:"boss"`
	KillType KillType `json:"kill_type"`
}

// DuplicateInstance is a sibling instance in the same duplicate group.
type DuplicateInstance struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	RecorderName string    `json:"recorder_name"`
	UploaderName string    `json:"uploader_name"`
	PlayerCount  int64     `json:"player_count"`
	DurationMs   *float64  `json:"duration_ms,omitempty"`
}
