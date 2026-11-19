package chronicle

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

// InsertParsedLoot writes finalized loot observations for an existing instance.
// The caller owns the instance row, parse-generation fence, and transaction.
// This is only the loot portion of parse-result ingestion.
func InsertParsedLoot(ctx context.Context, store database.Store, instanceID, realmID uuid.UUID, drops []parseresult.LootObservation) error {
	if len(drops) == 0 {
		return nil
	}
	rows := make([]database.InsertInstanceLootParams, 0, len(drops))
	for i, drop := range drops {
		source, err := guid.FromString(drop.SourceGUID)
		if err != nil {
			return fmt.Errorf("loot %d source GUID: %w", i, err)
		}
		received, err := guid.FromString(drop.ReceivedGUID)
		if err != nil {
			return fmt.Errorf("loot %d received GUID: %w", i, err)
		}
		rows = append(rows, database.InsertInstanceLootParams{
			InstanceID: instanceID, RealmID: realmID,
			SourceGuid: int64(source), SourceTs: database.Timestamptz(drop.SourceTS),
			ReceivedGuid: int64(received), ReceivedTs: database.Timestamptz(drop.ReceivedTS),
			ItemID: drop.ItemID, ItemName: drop.ItemName,
			LootSuffix: drop.LootSuffix, Quantity: drop.Quantity,
		})
	}
	if err := store.InsertInstanceLoot(ctx, rows).Close(); err != nil {
		return fmt.Errorf("insert parsed loot: %w", err)
	}
	return nil
}
