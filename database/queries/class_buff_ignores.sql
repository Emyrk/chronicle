-- name: ListClassBuffIgnoresForScope :many
SELECT normalized_name
FROM class_buff_ignores
WHERE scope_id = @scope_id
ORDER BY normalized_name;

-- name: ListClassBuffIgnorePolicies :many
SELECT tenant_id, normalized_name, spell_name
FROM class_buff_ignores
ORDER BY normalized_name, scope_id;

-- name: UpsertClassBuffIgnore :exec
INSERT INTO class_buff_ignores (scope_id, tenant_id, normalized_name, spell_name, updated_at)
VALUES (@scope_id, sqlc.narg(tenant_id)::UUID, lower(btrim(@spell_name::TEXT)), btrim(@spell_name::TEXT), now())
ON CONFLICT (scope_id, normalized_name) DO UPDATE SET
    spell_name = EXCLUDED.spell_name,
    updated_at = now();

-- name: DeleteClassBuffIgnore :exec
DELETE FROM class_buff_ignores
WHERE scope_id = @scope_id
  AND normalized_name = lower(btrim(@spell_name::TEXT));
