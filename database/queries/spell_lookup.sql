-- Canonical database-backed spell lookups. Each base spell row carries its
-- independently ordered normalized components without multiplying child rows.

-- name: GetCanonicalSpellByID :one
SELECT
  to_jsonb(s)::text AS spell_json,
  jsonb_build_object(
    'ct_base', ct.base,
    'ct_per_level', ct.per_level,
    'ct_minimum', ct.minimum,
    'dur_base', sd.duration,
    'dur_per_level', sd.duration_per_level,
    'dur_max', sd.max_duration,
    'range_min', sr.range_min,
    'range_max', sr.range_max,
    'range_flags', sr.flags,
    'range_name', sr.name,
    'icon_texture', si.texture_filename,
    'active_icon_texture', sia.texture_filename,
    'cat_flags', sc.flags,
    'cat_uses_per_week', sc.uses_per_week,
    'cat_name', sc.name,
    'cat_max_charges', sc.max_charges,
    'cat_charge_recovery_time', sc.charge_recovery_time,
    'cat_type_mask', sc.type_mask,
    'focus_name', sfo.name,
    'desc_variables', sdv.variables
  )::text AS metadata_json,
  COALESCE(effects.rows, '[]'::jsonb)::text AS effects_json,
  COALESCE(powers.rows, '[]'::jsonb)::text AS powers_json,
  COALESCE(variants.rows, '[]'::jsonb)::text AS variants_json
FROM dbc_spells s
LEFT JOIN dbc_spell_cast_times ct ON ct.dataset_id = s.dataset_id AND ct.id = s.casting_time_index
LEFT JOIN dbc_spell_durations sd ON sd.dataset_id = s.dataset_id AND sd.id = s.duration_index
LEFT JOIN dbc_spell_ranges sr ON sr.dataset_id = s.dataset_id AND sr.id = s.range_index
LEFT JOIN dbc_spell_icons si ON si.dataset_id = s.dataset_id AND si.id = s.spell_icon_id
LEFT JOIN dbc_spell_icons sia ON sia.dataset_id = s.dataset_id AND sia.id = s.active_icon_id
LEFT JOIN dbc_spell_categories sc ON sc.dataset_id = s.dataset_id AND sc.id = s.category
LEFT JOIN dbc_spell_focus_objects sfo ON sfo.dataset_id = s.dataset_id AND sfo.id = s.requires_spell_focus
LEFT JOIN dbc_spell_description_variables sdv ON sdv.dataset_id = s.dataset_id AND sdv.id = s.description_variables_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    to_jsonb(se) || jsonb_build_object(
      'effect_radius', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
        'ID', r.id,
        'Radius', r.radius,
        'RadiusPerLevel', r.radius_per_level,
        'RadiusMin', r.radius_min,
        'RadiusMax', r.radius_max
      ) END
    ) ORDER BY se.difficulty_id, se.effect_index, se.source_id
  ) AS rows
  FROM dbc_spell_effects se
  LEFT JOIN dbc_spell_radii r ON r.dataset_id = se.dataset_id AND r.id = se.effect_radius_index[1]
  WHERE se.dataset_id = s.dataset_id AND se.spell_id = s.spell_id
) effects ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.order_index, sp.source_id) AS rows
  FROM dbc_spell_powers sp
  WHERE sp.dataset_id = s.dataset_id AND sp.spell_id = s.spell_id
) powers ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(to_jsonb(sv) ORDER BY sv.difficulty_id) AS rows
  FROM dbc_spell_variants sv
  WHERE sv.dataset_id = s.dataset_id AND sv.spell_id = s.spell_id
) variants ON true
WHERE s.dataset_id = @dataset_id AND s.spell_id = @spell_id;

-- name: GetCanonicalSpellsByName :many
SELECT
  to_jsonb(s)::text AS spell_json,
  jsonb_build_object(
    'ct_base', ct.base,
    'ct_per_level', ct.per_level,
    'ct_minimum', ct.minimum,
    'dur_base', sd.duration,
    'dur_per_level', sd.duration_per_level,
    'dur_max', sd.max_duration,
    'range_min', sr.range_min,
    'range_max', sr.range_max,
    'range_flags', sr.flags,
    'range_name', sr.name,
    'icon_texture', si.texture_filename,
    'active_icon_texture', sia.texture_filename,
    'cat_flags', sc.flags,
    'cat_uses_per_week', sc.uses_per_week,
    'cat_name', sc.name,
    'cat_max_charges', sc.max_charges,
    'cat_charge_recovery_time', sc.charge_recovery_time,
    'cat_type_mask', sc.type_mask,
    'focus_name', sfo.name,
    'desc_variables', sdv.variables
  )::text AS metadata_json,
  COALESCE(effects.rows, '[]'::jsonb)::text AS effects_json,
  COALESCE(powers.rows, '[]'::jsonb)::text AS powers_json,
  COALESCE(variants.rows, '[]'::jsonb)::text AS variants_json
FROM dbc_spells s
LEFT JOIN dbc_spell_cast_times ct ON ct.dataset_id = s.dataset_id AND ct.id = s.casting_time_index
LEFT JOIN dbc_spell_durations sd ON sd.dataset_id = s.dataset_id AND sd.id = s.duration_index
LEFT JOIN dbc_spell_ranges sr ON sr.dataset_id = s.dataset_id AND sr.id = s.range_index
LEFT JOIN dbc_spell_icons si ON si.dataset_id = s.dataset_id AND si.id = s.spell_icon_id
LEFT JOIN dbc_spell_icons sia ON sia.dataset_id = s.dataset_id AND sia.id = s.active_icon_id
LEFT JOIN dbc_spell_categories sc ON sc.dataset_id = s.dataset_id AND sc.id = s.category
LEFT JOIN dbc_spell_focus_objects sfo ON sfo.dataset_id = s.dataset_id AND sfo.id = s.requires_spell_focus
LEFT JOIN dbc_spell_description_variables sdv ON sdv.dataset_id = s.dataset_id AND sdv.id = s.description_variables_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
    to_jsonb(se) || jsonb_build_object(
      'effect_radius', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
        'ID', r.id,
        'Radius', r.radius,
        'RadiusPerLevel', r.radius_per_level,
        'RadiusMin', r.radius_min,
        'RadiusMax', r.radius_max
      ) END
    ) ORDER BY se.difficulty_id, se.effect_index, se.source_id
  ) AS rows
  FROM dbc_spell_effects se
  LEFT JOIN dbc_spell_radii r ON r.dataset_id = se.dataset_id AND r.id = se.effect_radius_index[1]
  WHERE se.dataset_id = s.dataset_id AND se.spell_id = s.spell_id
) effects ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(to_jsonb(sp) ORDER BY sp.order_index, sp.source_id) AS rows
  FROM dbc_spell_powers sp
  WHERE sp.dataset_id = s.dataset_id AND sp.spell_id = s.spell_id
) powers ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(to_jsonb(sv) ORDER BY sv.difficulty_id) AS rows
  FROM dbc_spell_variants sv
  WHERE sv.dataset_id = s.dataset_id AND sv.spell_id = s.spell_id
) variants ON true
WHERE s.dataset_id = @dataset_id AND s.name = @name
ORDER BY s.spell_id;
