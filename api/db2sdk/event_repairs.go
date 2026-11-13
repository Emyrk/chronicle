package db2sdk

import (
	"encoding/json"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

// EventRepairReceipts exposes only receipt provenance. Never load or serialize
// the operation selection, operator identity, private executable plan or errors.
func EventRepairReceipts(rows []database.EventRepairReceipt) ([]chroniclesdk.EventRepairReceipt, error) {
	result := make([]chroniclesdk.EventRepairReceipt, 0, len(rows))
	for _, row := range rows {
		receipt := chroniclesdk.EventRepairReceipt{OperationID: row.OperationID, Operation: row.Operation, Version: int(row.Version), AppliedAt: row.AppliedAt.Time, Warnings: []string{}, Details: map[string]any{}}
		if err := json.Unmarshal(row.Warnings, &receipt.Warnings); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(row.Details, &receipt.Details); err != nil {
			return nil, err
		}
		result = append(result, receipt)
	}
	return result, nil
}
