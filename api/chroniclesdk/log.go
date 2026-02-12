package chroniclesdk

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type PeriodMoment struct {
	Timestamp time.Time `json:"timestamp"`
	Reason    string    `json:"reason"`
}

type ActivityPeriod struct {
	Start      *PeriodMoment `json:"start,omitempty"`
	End        *PeriodMoment `json:"end,omitempty"`
	LastActive *PeriodMoment `json:"last_active,omitempty"`

	Slain bool `json:"slain"`
}

type GUIDString = guid.GUID

type WoWLogGroup struct {
	ID        uuid.UUID          `json:"id"`
	Owner     uuid.UUID          `json:"owner"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
	UpdatedAt pgtype.Timestamptz `json:"updated_at"`

	Files            []WoWLogFile `json:"files"`
	ProcessingOutput any          `json:"processing_output,omitempty"`
}

type WoWLogFile struct {
	ID               uuid.UUID          `json:"id"`
	Owner            uuid.UUID          `json:"owner"`
	WowLogID         uuid.UUID          `json:"wow_log_id"`
	Hash             string             `json:"hash"`
	SizeBytes        int64              `json:"size_bytes"`
	MimeType         string             `json:"mime_type"`
	CreatedAt        pgtype.Timestamptz `json:"created_at"`
	UpdatedAt        pgtype.Timestamptz `json:"updated_at"`
	StorageDeletedAt pgtype.Timestamptz `json:"storage_deleted_at,omitempty"`
}

type WoWInstance struct {
	ID         uuid.UUID `json:"id"`
	RealmID    uuid.UUID `json:"realm_id"`
	LogGroupID uuid.UUID `json:"log_group_id"`
	Name       string    `json:"name"`
	Slug       string    `json:"slug"`
}

type WoWEncounter struct {
	ID         uuid.UUID   `json:"id"`
	InstanceID uuid.UUID   `json:"instance_id"`
	Boss       bool        `json:"boss"`
	Name       string      `json:"name"`
	Kill       bool        `json:"kill"`
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
	Encounters []WoWEncounterWithHostiles    `json:"encounters"`
	Units      map[GUIDString]InstanceUnit   `json:"units"`
	Players    map[GUIDString]InstancePlayer `json:"players"`
}
