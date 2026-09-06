-- Observed gear trends: the gear worn by the top leaderboard performances
-- of a class/spec, aggregated per equipment slot.
--
-- Cohort rules (shared by both queries):
--   * ranked parses only (encounter_dps_rankings), deduped to one
--     representative instance per run (duplicate uploads collapse via
--     COALESCE(duplicate_group_id, id) — the house convention);
--   * best parse (highest DPS) per unique player, optionally filtered by
--     raid (instance_name) and realm, then the top @top_n players by that
--     parse's DPS;
--   * each player's observation is the gear snapshot from THAT parse's
--     log instance — what they wore during the performance, not their
--     latest outfit;
--   * tenant scoping comes from RLS on encounter_dps_rankings plus the
--     wow_server_realms join for gear history (which has no RLS).
-- Item name/quality/icon/level are read from the snapshot jsonb itself,
-- so results are self-contained.

-- name: GearTrendsSlotItems :many
WITH representative_instances AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        li.id
    FROM log_instances li
    ORDER BY COALESCE(li.duplicate_group_id, li.id),
        -- Prefer the upload with the broadest boss-ranking coverage. The group
        -- anchor is the first upload, but it may be truncated before the final boss.
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = li.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
best_parse AS (
    SELECT DISTINCT ON (edr.realm_id, edr.player_guid)
        edr.realm_id, edr.player_guid, edr.instance_id, edr.dps
    FROM encounter_dps_rankings edr
    JOIN representative_instances ri ON ri.id = edr.instance_id
    WHERE edr.player_class = @player_class
      AND edr.player_spec = @player_spec
      AND edr.encounter_id IS NOT NULL
      AND edr.killed_at >= @since::timestamptz
      AND (sqlc.narg(instance_name)::text IS NULL OR edr.instance_name = sqlc.narg(instance_name))
      AND (sqlc.narg(realm_id)::uuid IS NULL OR edr.realm_id = sqlc.narg(realm_id))
    ORDER BY edr.realm_id, edr.player_guid, edr.dps DESC
),
top_players AS (
    SELECT bp.realm_id, bp.player_guid, bp.instance_id
    FROM best_parse bp
    ORDER BY bp.dps DESC
    LIMIT @top_n
),
cohort AS (
    SELECT h.gear
    FROM game_player_gear_history h
    JOIN wow_server_realms wsr ON wsr.id = h.realm_id
    JOIN top_players tp
      ON h.player_id = tp.player_guid
     AND h.realm_id = tp.realm_id
     AND h.instance_id = tp.instance_id
),
slot_items AS (
    SELECT (elem.ordinality - 1)::int AS slot,
        COALESCE((elem.value ->> 'item_id')::int, 0) AS item_id,
        elem.value ->> 'item_name' AS item_name,
        COALESCE((elem.value ->> 'item_quality')::int, 0) AS item_quality,
        COALESCE(elem.value ->> 'item_icon', '') AS item_icon,
        (elem.value ->> 'item_level')::int AS item_level
    FROM cohort c
    CROSS JOIN LATERAL jsonb_array_elements(c.gear) WITH ORDINALITY AS elem(value, ordinality)
)
SELECT
    si.slot,
    si.item_id::int AS item_id,
    COUNT(*)::int AS wearer_count,
    (SELECT COUNT(*) FROM cohort)::int AS cohort_size,
    COALESCE(MAX(si.item_name), '')::text AS item_name,
    COALESCE(MAX(si.item_quality), 0)::int AS item_quality,
    COALESCE(MAX(si.item_icon), '')::text AS item_icon,
    COALESCE(MAX(si.item_level), 0)::int AS item_level
FROM slot_items si
WHERE si.item_id > 0
GROUP BY si.slot, si.item_id
ORDER BY si.slot, wearer_count DESC, si.item_id;

-- name: GearTrendsSlotEnchants :many
WITH representative_instances AS (
    SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
        li.id
    FROM log_instances li
    ORDER BY COALESCE(li.duplicate_group_id, li.id),
        -- Prefer the upload with the broadest boss-ranking coverage. The group
        -- anchor is the first upload, but it may be truncated before the final boss.
        (SELECT COUNT(DISTINCT coverage.encounter_name)
         FROM encounter_dps_rankings coverage
         WHERE coverage.instance_id = li.id
           AND coverage.encounter_id IS NOT NULL) DESC,
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
best_parse AS (
    SELECT DISTINCT ON (edr.realm_id, edr.player_guid)
        edr.realm_id, edr.player_guid, edr.instance_id, edr.dps
    FROM encounter_dps_rankings edr
    JOIN representative_instances ri ON ri.id = edr.instance_id
    WHERE edr.player_class = @player_class
      AND edr.player_spec = @player_spec
      AND edr.encounter_id IS NOT NULL
      AND edr.killed_at >= @since::timestamptz
      AND (sqlc.narg(instance_name)::text IS NULL OR edr.instance_name = sqlc.narg(instance_name))
      AND (sqlc.narg(realm_id)::uuid IS NULL OR edr.realm_id = sqlc.narg(realm_id))
    ORDER BY edr.realm_id, edr.player_guid, edr.dps DESC
),
top_players AS (
    SELECT bp.realm_id, bp.player_guid, bp.instance_id
    FROM best_parse bp
    ORDER BY bp.dps DESC
    LIMIT @top_n
),
cohort AS (
    SELECT h.gear
    FROM game_player_gear_history h
    JOIN wow_server_realms wsr ON wsr.id = h.realm_id
    JOIN top_players tp
      ON h.player_id = tp.player_guid
     AND h.realm_id = tp.realm_id
     AND h.instance_id = tp.instance_id
),
slot_enchants AS (
    SELECT (elem.ordinality - 1)::int AS slot,
        NULLIF(elem.value ->> 'enchant_id', '')::int AS enchant_id
    FROM cohort c
    CROSS JOIN LATERAL jsonb_array_elements(c.gear) WITH ORDINALITY AS elem(value, ordinality)
    WHERE COALESCE((elem.value ->> 'item_id')::int, 0) > 0
)
SELECT
    se.slot,
    se.enchant_id::int AS enchant_id,
    COUNT(*)::int AS wearer_count,
    (SELECT COUNT(*) FROM cohort)::int AS cohort_size,
    COALESCE(e.name_lang, '')::text AS enchant_name
FROM slot_enchants se
LEFT JOIN dbc_spell_item_enchantment e
       ON e.dataset_id = @dataset_id AND e.id = se.enchant_id
WHERE se.enchant_id IS NOT NULL
GROUP BY se.slot, se.enchant_id, e.name_lang
ORDER BY se.slot, wearer_count DESC, se.enchant_id;
