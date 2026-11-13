package db2sdk

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEventRepairReceiptPublicProjection(t *testing.T) {
	t.Parallel()
	rows, err := EventRepairReceipts([]database.EventRepairReceipt{{InstanceID: uuid.New(), TenantID: uuid.New(), OperationID: uuid.New(), Operation: "razorgore-phase-two", Version: 1, AppliedAt: database.Timestamptz(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)), Warnings: []byte(`["Some irrelevant events omitted"]`), Details: []byte(`{"phases":[{"encounter_id":"example","reconstructed":true}]}`)}})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, 1, rows[0].Version)
	require.NotEmpty(t, rows[0].Warnings)
	require.Contains(t, rows[0].Details, "phases")
	encoded, err := json.Marshal(rows[0])
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(encoded, &fields))
	require.Len(t, fields, 6)
	for _, private := range []string{"created_by", "tenant_id", "selection", "plan", "last_error", "instance_id"} {
		require.NotContains(t, fields, private)
	}
}
func TestInstanceRepairsAreOptional(t *testing.T) {
	t.Parallel()
	encoded, err := json.Marshal(chroniclesdk.WoWInstance{})
	require.NoError(t, err)
	var fields map[string]any
	require.NoError(t, json.Unmarshal(encoded, &fields))
	require.NotContains(t, fields, "repairs")
	_, err = EventRepairReceipts([]database.EventRepairReceipt{{Warnings: []byte(`invalid`), Details: []byte(`{}`)}})
	require.Error(t, err)
}
