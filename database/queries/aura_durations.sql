-- name: DeleteAffectedAuraDurationsByDataset :exec
DELETE FROM dbc_affected_aura_durations WHERE dataset_id = @dataset_id;

-- name: ListAuraDurationModifiersForDerivation :many
SELECT
    spell_id,
    name,
    percent,
    flat,
    deprecated,
    spell_class_set,
    spell_class_mask
FROM dbc_duration_modifiers
WHERE dataset_id = @dataset_id
ORDER BY spell_id;

-- name: ListAffectedAuraDurationCandidates :many
SELECT
    spell.spell_id,
    spell.name,
    spell.spell_class_set,
    spell.spell_class_mask,
    duration.max_duration AS base_duration_ms,
    COALESCE(
        spell.name LIKE '%[Deprecated]%' OR
        spell.name LIKE 'zzOLD%' OR
        spell.name LIKE 'Test %',
        false
    )::BOOLEAN AS deprecated
FROM dbc_spells spell
JOIN dbc_spell_durations duration
  ON duration.dataset_id = spell.dataset_id
 AND duration.id = spell.duration_index
WHERE spell.dataset_id = @dataset_id
  AND spell.spell_class_mask <> 0
  AND EXISTS (
      SELECT 1
      FROM dbc_duration_modifiers modifier
      WHERE modifier.dataset_id = spell.dataset_id
        AND modifier.spell_class_set = spell.spell_class_set
        AND (modifier.spell_class_mask & spell.spell_class_mask) <> 0
  )
ORDER BY spell.spell_id;

-- name: InsertAffectedAuraDurations :batchexec
INSERT INTO dbc_affected_aura_durations (
    dataset_id,
    spell_id,
    spell_name,
    spell_class_set,
    base_duration_ms,
    max_duration_ms,
    deprecated
)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: InsertAffectedAuraDurationModifiers :batchexec
INSERT INTO dbc_affected_aura_duration_modifiers (
    dataset_id,
    spell_id,
    modifier_spell_id
)
VALUES ($1, $2, $3);

-- name: ListAffectedAuraDurationsByDataset :many
SELECT
    affected.spell_id,
    affected.spell_name,
    affected.spell_class_set,
    affected.base_duration_ms,
    affected.max_duration_ms,
    affected.deprecated,
    modifier.spell_id AS modifier_spell_id,
    modifier.name AS modifier_name,
    modifier.percent AS modifier_percent,
    modifier.flat AS modifier_flat,
    modifier.deprecated AS modifier_deprecated
FROM dbc_affected_aura_durations affected
JOIN dbc_affected_aura_duration_modifiers affected_modifier
  ON affected_modifier.dataset_id = affected.dataset_id
 AND affected_modifier.spell_id = affected.spell_id
JOIN dbc_duration_modifiers modifier
  ON modifier.dataset_id = affected_modifier.dataset_id
 AND modifier.spell_id = affected_modifier.modifier_spell_id
WHERE affected.dataset_id = @dataset_id
ORDER BY affected.spell_name, affected.spell_id, modifier.spell_id;
