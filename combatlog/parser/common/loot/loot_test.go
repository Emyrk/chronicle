package loot

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestSnapshotCopiesFinalizedLoot(t *testing.T) {
	t.Parallel()
	var missing *LootTracker
	require.Nil(t, missing.Snapshot())

	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	tracker := &LootTracker{loot: []*FinalLoot{{
		Source: guid.GUID(1), Received: guid.GUID(2),
		SourceName: "First", ReceivedName: "Second", SourceTS: at, ReceivedTS: at,
		ItemName: "Test item", ItemID: 123, LootSuffix: 4, Quantity: 2,
	}}}
	got := tracker.Snapshot()
	require.Len(t, got, 1)
	require.Equal(t, *tracker.loot[0], got[0])

	got[0].ItemName = "changed"
	require.Equal(t, "Test item", tracker.loot[0].ItemName)

	encoded, err := json.Marshal(tracker.Snapshot())
	require.NoError(t, err)
	var decoded []FinalLoot
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.Equal(t, tracker.Snapshot(), decoded)
}
