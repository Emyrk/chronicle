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

	Files            []WoWLogFile `json:"files"`
	ProcessingOutput any          `json:"processing_output,omitempty"`
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
	ID         uuid.UUID `json:"id"`
	RealmID    uuid.UUID `json:"realm_id"`
	LogGroupID uuid.UUID `json:"log_group_id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
	Guild        *Guild   `json:"guild,omitempty"`
	Capabilities []string `json:"capabilities"`
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
}

// InstanceReport contains timing details for a single parsed instance.
type InstanceReport struct {
	Name             string   `json:"name"`
	FinalizeDuration Duration `json:"finalize_duration_ms"`
	DBInsertDuration Duration `json:"db_insert_duration_ms"`
	EncounterCount   int      `json:"encounter_count"`
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
}

type WoWParsedInstance struct {
	WoWInstance
	RealmName  string                        `json:"realm_name,omitempty"`
	Encounters []WoWEncounterWithHostiles    `json:"encounters"`
	Units      map[GUIDString]InstanceUnit   `json:"units"`
	Players    map[GUIDString]InstancePlayer `json:"players"`
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
}

// RecentEncounter is a simplified encounter summary for the recent raids list.
type RecentEncounter struct {
	Name     string   `json:"name"`
	Boss     bool     `json:"boss"`
	KillType KillType `json:"kill_type"`
}
