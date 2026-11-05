package parseresult

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBuildFinalizedLootRoundTrip(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	tracker := loot.New(unitdb.New())
	require.NoError(t, tracker.ProcessMessage(false, uuid.Nil, &messages.Loot{
		MessageBase: messages.Base(at), PlayerName: "First", ItemName: "Test item",
		ItemID: 123, ItemSuffixID: 4, Quantity: 2,
	}))
	require.NoError(t, tracker.Finalize(context.Background()))
	result, err := Build(Input{
		Format:    database.LogFormat112aCcAddon,
		Finalized: &instances.FinalizedInstance{Loot: tracker}, Events: encounterevents.NewEvents(),
	})
	require.NoError(t, err)
	require.Equal(t, 3, result.SchemaVersion)
	require.Equal(t, []LootObservation{{
		SourceGUID: "0x0000000000000000", ReceivedGUID: "0x0000000000000000",
		SourceTS: at, ReceivedTS: at, ItemName: "Test item",
		ItemID: 123, LootSuffix: 4, Quantity: 2,
	}}, result.Loot)

	encoded, err := json.Marshal(result)
	require.NoError(t, err)
	var decoded Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.Equal(t, result.Loot, decoded.Loot)
}
