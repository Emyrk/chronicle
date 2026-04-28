package chroniclesdk

import "github.com/google/uuid"

type InstanceCategory string

const (
	InstanceCategoryRaid    InstanceCategory = "raid"
	InstanceCategoryDungeon InstanceCategory = "dungeon"
	InstanceCategoryPvP     InstanceCategory = "pvp"
)

type UnitAffiliation string

const (
	UnitAffiliationUnknown  UnitAffiliation = "unknown"
	UnitAffiliationFriendly UnitAffiliation = "friendly"
	UnitAffiliationNeutral  UnitAffiliation = "neutral"
	UnitAffiliationHostile  UnitAffiliation = "hostile"
	UnitAffiliationVary     UnitAffiliation = "vary"
)

type WorldInstanceTemplate struct {
	ID           uuid.UUID               `json:"id"`
	WorldID      uuid.UUID               `json:"world_id"`
	Name         string                  `json:"name"`
	Abbreviation string                  `json:"abbreviation,omitempty"`
	Category     InstanceCategory        `json:"category"`
	BossCount    *int32                  `json:"boss_count,omitempty"`
	Background   string                  `json:"background,omitempty"`
	ZoneNames    []WorldInstanceZoneName `json:"zone_names"`
}

type WorldInstanceZoneName struct {
	ZoneName    string `json:"zone_name"`
	DisplayName string `json:"display_name"`
}

type WorldInstanceUnit struct {
	EntryID       int32           `json:"entry_id"`
	Name          string          `json:"name"` // Resolved: override_name ?? world_creature_template.name ?? "Unknown"
	OverrideName  string          `json:"override_name,omitempty"`
	EncounterName string          `json:"encounter_name,omitempty"`
	Boss          bool            `json:"boss"`
	Affiliation   UnitAffiliation `json:"affiliation"`
}

// UpsertWorldInstanceTemplateRequest is the request body for creating/updating an instance template.
type UpsertWorldInstanceTemplateRequest struct {
	WorldID      uuid.UUID               `json:"world_id"`
	Name         string                  `json:"name"`
	Abbreviation string                  `json:"abbreviation,omitempty"`
	Category     InstanceCategory        `json:"category"`
	BossCount    *int32                  `json:"boss_count,omitempty"`
	Background   string                  `json:"background,omitempty"`
	ZoneNames    []WorldInstanceZoneName `json:"zone_names"`
}

// BulkUpsertWorldInstanceUnitsRequest is the request body for bulk upserting units.
type BulkUpsertWorldInstanceUnitsRequest struct {
	Units []WorldInstanceUnit `json:"units"`
}
