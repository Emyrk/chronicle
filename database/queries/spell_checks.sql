-- Read-only source rows used by the spell dataset integrity checker.

-- name: ListSpellIDsForCheck :many
SELECT spell_id
FROM dbc_spells
WHERE dataset_id = $1
ORDER BY spell_id;

-- name: ListSpellEffectsForCheck :many
SELECT spell_id, difficulty_id, effect_index, source_id, effect_base_points_f
FROM dbc_spell_effects
WHERE dataset_id = $1
ORDER BY spell_id, difficulty_id, effect_index, source_id;

-- name: ListSpellPowersForCheck :many
SELECT spell_id, order_index, source_id
FROM dbc_spell_powers
WHERE dataset_id = $1
ORDER BY spell_id, order_index, source_id;

-- name: ListSpellVariantsForCheck :many
SELECT spell_id, difficulty_id
FROM dbc_spell_variants
WHERE dataset_id = $1
ORDER BY spell_id, difficulty_id;
