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
