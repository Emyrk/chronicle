-- name: ListCooldownSpellsByDataset :many
SELECT
    spell_id,
    name,
    name_subtext,
    recovery_time_ms,
    category_recovery_time_ms,
    spell_class_set
FROM dbc_cooldown_spells
WHERE dataset_id = @dataset_id
ORDER BY spell_class_set, name, spell_id;
