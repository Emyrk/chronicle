package chroniclesdk

import (
	"time"

	"github.com/google/uuid"
)

type ArmoryPlayer struct {
	ID        GUIDString   `json:"id"`
	RealmName string       `json:"realm_name"`
	RealmID   uuid.UUID    `json:"realm_id"`
	Name      string       `json:"name"`
	Class     string       `json:"class"`
	Race      string       `json:"race"`
	Gender    string       `json:"gender"`
	GuildID   *uuid.UUID   `json:"guild_id,omitempty"`
	GuildName string       `json:"guild_name,omitempty"`
	Gear               PlayerOutfit `json:"gear"`
	UpdatedAt          time.Time    `json:"updated_at"`
	UpdatedFromInstance *uuid.UUID  `json:"updated_from_instance,omitempty"`
}

// PlayerOutfit mirrors database.PlayerOutfit for the SDK layer.
type PlayerOutfit [19]PlayerGear

type PlayerGear struct {
	ItemID      int32  `json:"item_id"`
	EnchantID   *int32 `json:"enchant_id,omitempty"`
	ItemName    string `json:"item_name,omitempty"`
	ItemQuality int32  `json:"item_quality,omitempty"`
	ItemIcon    string `json:"item_icon,omitempty"`
}
