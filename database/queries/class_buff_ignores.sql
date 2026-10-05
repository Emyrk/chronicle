-- name: ListClassBuffIgnores :many
SELECT normalized_name FROM class_buff_ignores ORDER BY normalized_name;

-- name: UpsertClassBuffIgnore :exec
INSERT INTO class_buff_ignores (normalized_name, spell_name, updated_at)
VALUES (lower(btrim(@spell_name::TEXT)), btrim(@spell_name::TEXT), now())
ON CONFLICT (normalized_name) DO UPDATE SET
    spell_name = EXCLUDED.spell_name,
    updated_at = now();

-- name: DeleteClassBuffIgnore :exec
DELETE FROM class_buff_ignores
WHERE normalized_name = lower(btrim(@spell_name::TEXT));
