package parseresult

import (
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
)

// LootObservation contains the finalized values the primary needs to insert a
// loot row. Instance and realm IDs are resolved by the primary at ingest time.
type LootObservation struct {
	SourceGUID   string    `json:"source_guid"`
	SourceTS     time.Time `json:"source_ts"`
	ReceivedGUID string    `json:"received_guid"`
	ReceivedTS   time.Time `json:"received_ts"`
	ItemID       int32     `json:"item_id"`
	ItemName     string    `json:"item_name"`
	LootSuffix   int32     `json:"loot_suffix"`
	Quantity     int32     `json:"quantity"`
}

func buildLoot(tracker *loot.LootTracker) []LootObservation {
	drops := tracker.Snapshot()
	out := make([]LootObservation, 0, len(drops))
	for _, drop := range drops {
		out = append(out, LootObservation{
			SourceGUID: drop.Source.String(), SourceTS: drop.SourceTS,
			ReceivedGUID: drop.Received.String(), ReceivedTS: drop.ReceivedTS,
			ItemID: drop.ItemID, ItemName: drop.ItemName,
			LootSuffix: drop.LootSuffix, Quantity: drop.Quantity,
		})
	}
	return out
}
