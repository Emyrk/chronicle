-- name: ListInstanceEventRepairReceipts :many
SELECT * FROM event_repair_receipts WHERE instance_id = @instance_id ORDER BY operation;

-- name: GetEventRepairReceipt :one
SELECT * FROM event_repair_receipts WHERE instance_id = @instance_id AND operation = @operation AND tenant_id = @tenant_id;

-- name: InsertEventRepairReceipt :one
INSERT INTO event_repair_receipts(instance_id, operation, version, operation_id, tenant_id, warnings, details)
VALUES (@instance_id, @operation, @version, @operation_id, @tenant_id, @warnings, @details)
ON CONFLICT (instance_id, operation) DO NOTHING
RETURNING *;
