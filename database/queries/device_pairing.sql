-- name: InsertDevicePairing :one
INSERT INTO device_pairings (user_code, device_code_hash, device_name, expires_at)
VALUES (@user_code, @device_code_hash, @device_name, @expires_at)
RETURNING *;

-- name: GetDevicePairingByUserCode :one
SELECT * FROM device_pairings
WHERE user_code = @user_code AND expires_at > NOW();

-- name: ResolveDevicePairingByUserCode :one
-- Approve or deny a pending, unexpired pairing on behalf of a user.
UPDATE device_pairings
SET status = @status, user_id = @user_id
WHERE user_code = @user_code AND status = 'pending' AND expires_at > NOW()
RETURNING *;

-- name: GetDevicePairingByDeviceCodeHash :one
SELECT * FROM device_pairings WHERE device_code_hash = @device_code_hash;

-- name: RedeemDevicePairing :one
-- Single-use: flips approved -> redeemed exactly once.
UPDATE device_pairings
SET status = 'redeemed'
WHERE id = @id AND status = 'approved' AND expires_at > NOW()
RETURNING *;

-- name: DeleteExpiredDevicePairings :execrows
DELETE FROM device_pairings WHERE expires_at <= NOW() - interval '1 hour';

-- name: InsertUploadDevice :one
INSERT INTO upload_devices (user_id, name, token_hash)
VALUES (@user_id, @name, @token_hash)
RETURNING *;

-- name: GetUploadDeviceByTokenHash :one
SELECT * FROM upload_devices
WHERE token_hash = @token_hash AND revoked_at IS NULL;

-- name: ListUploadDevicesByUser :many
SELECT * FROM upload_devices
WHERE user_id = @user_id AND revoked_at IS NULL
ORDER BY created_at DESC;

-- name: RevokeUploadDevice :execrows
UPDATE upload_devices SET revoked_at = NOW()
WHERE id = @id AND user_id = @user_id AND revoked_at IS NULL;

-- name: TouchUploadDeviceLastUsed :exec
UPDATE upload_devices SET last_used_at = NOW() WHERE id = @id;
