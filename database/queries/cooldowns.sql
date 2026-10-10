-- name: ListCooldownSpellsByDataset :many
SELECT
    c.spell_id,
    c.name,
    c.name_subtext,
    c.recovery_time_ms,
    c.category_recovery_time_ms,
    c.spell_class_set,
    COALESCE(o.ignored, FALSE)::BOOLEAN AS ignored,
    COALESCE(o.hide_duration, FALSE)::BOOLEAN AS duration_hidden,
    -- Imported effective duration takes precedence; legacy rows fall back to
    -- SpellDuration metadata. Reports 0 when instant, unknown, or infinite (-1).
    GREATEST(COALESCE(c.duration_ms, d.max_duration, 0), 0)::BIGINT AS duration_ms
FROM dbc_cooldown_spells c
LEFT JOIN dataset_cooldown_overrides o
    ON o.dataset_id = c.dataset_id AND o.spell_id = c.spell_id
LEFT JOIN dbc_spells s
    ON s.dataset_id = c.dataset_id AND s.spell_id = c.spell_id
LEFT JOIN dbc_spell_durations d
    ON d.dataset_id = c.dataset_id AND d.id = s.duration_index
WHERE c.dataset_id = @dataset_id
ORDER BY c.spell_class_set, c.name, c.spell_id;

-- name: UpsertCooldownOverrides :exec
-- NULL ignored/hide_duration leaves that flag unchanged.
INSERT INTO dataset_cooldown_overrides (dataset_id, spell_id, ignored, hide_duration)
SELECT
    c.dataset_id,
    c.spell_id,
    COALESCE(sqlc.narg(ignored)::BOOLEAN, FALSE),
    COALESCE(sqlc.narg(hide_duration)::BOOLEAN, FALSE)
FROM dbc_cooldown_spells c
WHERE c.dataset_id = @dataset_id
  AND c.spell_id = ANY(@spell_ids::INT[])
ON CONFLICT (dataset_id, spell_id) DO UPDATE SET
    ignored = COALESCE(sqlc.narg(ignored)::BOOLEAN, dataset_cooldown_overrides.ignored),
    hide_duration = COALESCE(sqlc.narg(hide_duration)::BOOLEAN, dataset_cooldown_overrides.hide_duration);

-- name: DeleteEmptyCooldownOverrides :exec
DELETE FROM dataset_cooldown_overrides
WHERE dataset_id = @dataset_id
  AND NOT ignored
  AND NOT hide_duration;
