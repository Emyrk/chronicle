package chroniclesdk

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
)

type InstanceLoot struct {
	SourceGuid   guid.GUID `json:"source_guid"`
	SourceTS     time.Time `json:"source_ts"`
	ReceivedGuid guid.GUID `json:"received_guid"`
	ReceivedTS   time.Time `json:"received_ts"`
	ItemID       int32     `json:"item_id"`
	ItemName     string    `json:"item_name"`
	LootSuffix   int32     `json:"loot_suffix"`
	Quantity     int32     `json:"quantity"`
	Quality      int32     `json:"quality"`
	Icon         string    `json:"icon"`
}
