-- name: ListCooldownSpellsByDataset :many
SELECT
    c.spell_id,
    c.name,
    c.name_subtext,
    c.recovery_time_ms,
    c.category_recovery_time_ms,
    c.spell_class_set,
    (i.spell_id IS NOT NULL)::BOOLEAN AS ignored,
    -- Aura/effect duration; 0 when instant, unknown, or infinite (-1).
    GREATEST(COALESCE(d.max_duration, 0), 0)::BIGINT AS duration_ms
FROM dbc_cooldown_spells c
LEFT JOIN dataset_cooldown_ignores i
    ON i.dataset_id = c.dataset_id AND i.spell_id = c.spell_id
LEFT JOIN dbc_spells s
    ON s.dataset_id = c.dataset_id AND s.spell_id = c.spell_id
LEFT JOIN dbc_spell_durations d
    ON d.dataset_id = c.dataset_id AND d.id = s.duration_index
WHERE c.dataset_id = @dataset_id
ORDER BY c.spell_class_set, c.name, c.spell_id;

-- name: IgnoreCooldownSpells :exec
INSERT INTO dataset_cooldown_ignores (dataset_id, spell_id)
SELECT c.dataset_id, c.spell_id
FROM dbc_cooldown_spells c
WHERE c.dataset_id = @dataset_id
  AND c.spell_id = ANY(@spell_ids::INT[])
ON CONFLICT DO NOTHING;

-- name: UnignoreCooldownSpells :exec
DELETE FROM dataset_cooldown_ignores
WHERE dataset_id = @dataset_id
  AND spell_id = ANY(@spell_ids::INT[]);
