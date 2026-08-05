-- Observed gear trends: what logged players of a class/spec actually wore,
-- aggregated per equipment slot from armory gear-history snapshots.
--
-- Cohort rules (shared by both queries):
--   * ranked parses only (encounter_dps_rankings), deduped to one
--     representative instance per run (duplicate uploads collapse via
--     COALESCE(duplicate_group_id, id) — the house convention);
--   * one observation per unique player: the latest qualifying snapshot
--     in the window;
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
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
qualifying AS (
    SELECT DISTINCT edr.realm_id, edr.player_guid, edr.instance_id
    FROM encounter_dps_rankings edr
    JOIN representative_instances ri ON ri.id = edr.instance_id
    WHERE edr.player_class = @player_class
      AND edr.player_spec = @player_spec
      AND edr.encounter_id IS NOT NULL
      AND edr.killed_at >= @since::timestamptz
),
cohort AS (
    SELECT DISTINCT ON (h.realm_id, h.player_id) h.gear
    FROM game_player_gear_history h
    JOIN wow_server_realms wsr ON wsr.id = h.realm_id
    JOIN qualifying q
      ON h.player_id = q.player_guid
     AND h.realm_id = q.realm_id
     AND h.instance_id = q.instance_id
    ORDER BY h.realm_id, h.player_id, h.equipped_at DESC
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
        (li.id = li.duplicate_group_id) DESC NULLS LAST,
        li.start_time ASC,
        li.id ASC
),
qualifying AS (
    SELECT DISTINCT edr.realm_id, edr.player_guid, edr.instance_id
    FROM encounter_dps_rankings edr
    JOIN representative_instances ri ON ri.id = edr.instance_id
    WHERE edr.player_class = @player_class
      AND edr.player_spec = @player_spec
      AND edr.encounter_id IS NOT NULL
      AND edr.killed_at >= @since::timestamptz
),
cohort AS (
    SELECT DISTINCT ON (h.realm_id, h.player_id) h.gear
    FROM game_player_gear_history h
    JOIN wow_server_realms wsr ON wsr.id = h.realm_id
    JOIN qualifying q
      ON h.player_id = q.player_guid
     AND h.realm_id = q.realm_id
     AND h.instance_id = q.instance_id
    ORDER BY h.realm_id, h.player_id, h.equipped_at DESC
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
