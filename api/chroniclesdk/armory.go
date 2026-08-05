package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type ArmoryPlayer struct {
	ID                  GUIDString      `json:"id"`
	RealmName           string          `json:"realm_name"`
	RealmID             uuid.UUID       `json:"realm_id"`
	Name                string          `json:"name"`
	Class               string          `json:"class"`
	Race                string          `json:"race"`
	Gender              string          `json:"gender"`
	Level               int32           `json:"level"`
	GuildID             *uuid.UUID      `json:"guild_id,omitempty"`
	GuildName           string          `json:"guild_name,omitempty"`
	Gear                PlayerOutfit    `json:"gear"`
	Talents             *PlayerTalents  `json:"talents,omitempty"`
	UpdatedAt           time.Time       `json:"updated_at"`
	UpdatedFromInstance *uuid.UUID      `json:"updated_from_instance,omitempty"`
	// DatasetID is the resolved game-data dataset for this player's realm.
	// Frontends use it to fetch matching talent/spell data regardless of the
	// tenant domain serving the request.
	DatasetID uuid.UUID `json:"dataset_id"`
	// IconBaseURL is the icon CDN base URL of the resolved dataset. Frontends
	// use it to fetch icons matching the realm's game data instead of the
	// compiled-in default.
	IconBaseURL string `json:"icon_base_url,omitempty"`
}

// PlayerTalents represents a player's talent allocation across three trees.
type PlayerTalents struct {
	Trees [3]PlayerTalentTab `json:"trees"`
}

type PlayerTalentTab struct {
	TabName     string `json:"tab_name,omitempty"`
	PointsSpent int    `json:"points_spent"`
	Ranks       string `json:"ranks"`
}

// PlayerOutfit mirrors database.PlayerOutfit for the SDK layer.
type PlayerOutfit [19]PlayerGear

type PlayerGear struct {
	ItemID      int32  `json:"item_id"`
	EnchantID   *int32 `json:"enchant_id,omitempty"`
	ItemName    string `json:"item_name,omitempty"`
	ItemQuality int32  `json:"item_quality,omitempty"`
	ItemIcon    string `json:"item_icon,omitempty"`
	TransmogID  *int32 `json:"transmog_id,omitempty"`
	// ItemLevel is nil for gear snapshots stored before item levels were
	// recorded, or when the item's template metadata was not found.
	ItemLevel *int32 `json:"item_level,omitempty"`
}

// ArmoryGearHistoryResponse lists a player's gear snapshots, newest first.
type ArmoryGearHistoryResponse struct {
	Snapshots []ArmoryGearSnapshot `json:"snapshots"`
}

// ArmoryGearSnapshot is the outfit a player wore as of the last combatant
// info seen in one log instance.
type ArmoryGearSnapshot struct {
	InstanceID   uuid.UUID `json:"instance_id"`
	InstanceName string    `json:"instance_name"`
	InstanceSlug string    `json:"instance_slug,omitempty"`
	EquippedAt   time.Time `json:"equipped_at"`
	// AvgIlvl averages item_level across equipped slots (shirt and tabard
	// excluded); nil when no equipped item had a known item level.
	AvgIlvl *float64     `json:"avg_ilvl,omitempty"`
	Gear    PlayerOutfit `json:"gear"`
}

// ArmoryLootResponse lists loot a character received, newest first.
type ArmoryLootResponse struct {
	Items []ArmoryLootItem `json:"items"`
}

type ArmoryLootItem struct {
	ItemID       int32     `json:"item_id"`
	ItemName     string    `json:"item_name"`
	Quality      int32     `json:"quality"`
	Icon         string    `json:"icon,omitempty"`
	Quantity     int32     `json:"quantity"`
	InstanceID   uuid.UUID `json:"instance_id"`
	InstanceName string    `json:"instance_name"`
	InstanceSlug string    `json:"instance_slug,omitempty"`
	ReceivedAt   time.Time `json:"received_at"`
}

// ArmorySearchResult is a lightweight player result without gear data.
type ArmorySearchResult struct {
	ID        GUIDString `json:"id"`
	RealmName string     `json:"realm_name"`
	RealmID   uuid.UUID  `json:"realm_id"`
	Name      string     `json:"name"`
	Class     string     `json:"class"`
	Race      string     `json:"race"`
	Gender    string     `json:"gender"`
	Level     int32      `json:"level"`
	GuildID   *uuid.UUID `json:"guild_id,omitempty"`
	GuildName string     `json:"guild_name,omitempty"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type ArmorySearchResponse struct {
	Players []ArmorySearchResult `json:"players"`
	Count   int                  `json:"count"`
}
