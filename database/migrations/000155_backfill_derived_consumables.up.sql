BEGIN;

-- Migration 000148 created the derived consumable tables, but existing datasets
-- were not rebuilt until their item or spell data was uploaded again. Rebuild
-- the derived catalog so reparsing an existing log can classify consume evidence.
DELETE FROM dbc_consumables;

INSERT INTO dbc_consumables (
    dataset_id,
    item_id,
    item_name,
    item_quality,
    item_icon,
    item_spell_ids
)
SELECT
    wit.dataset_id,
    wit.entry,
    wit.name,
    wit.quality,
    COALESCE(NULLIF(wdi.icon, ''), dbi.inventory_icon ->> 0, '')::text,
    ARRAY_REMOVE(ARRAY[
        wit.spellid_1,
        wit.spellid_2,
        wit.spellid_3,
        wit.spellid_4,
        wit.spellid_5
    ], 0)::int[]
FROM world_item_template wit
LEFT JOIN world_display_info wdi
    ON wdi.dataset_id = wit.dataset_id AND wdi.id = wit.display_id
LEFT JOIN dbc_item_display_info dbi
    ON dbi.dataset_id = wit.dataset_id AND dbi.id = wit.display_id
WHERE wit.class = 0
  AND (
      wit.spellid_1 <> 0 OR
      wit.spellid_2 <> 0 OR
      wit.spellid_3 <> 0 OR
      wit.spellid_4 <> 0 OR
      wit.spellid_5 <> 0
  );

WITH RECURSIVE roots AS (
    SELECT
        c.dataset_id,
        c.item_id,
        root_spell_id
    FROM dbc_consumables c
    CROSS JOIN LATERAL unnest(c.item_spell_ids) AS root_spell_id
), spell_graph AS (
    SELECT
        r.dataset_id,
        r.item_id,
        r.root_spell_id,
        r.root_spell_id AS spell_id,
        ARRAY[r.root_spell_id]::int[] AS path
    FROM roots r

    UNION ALL

    SELECT
        graph.dataset_id,
        graph.item_id,
        graph.root_spell_id,
        triggered.spell_id,
        graph.path || triggered.spell_id
    FROM spell_graph graph
    JOIN dbc_spells spell
      ON spell.dataset_id = graph.dataset_id
     AND spell.spell_id = graph.spell_id
    CROSS JOIN LATERAL unnest(ARRAY[
        spell.effect_trigger_spell_0,
        spell.effect_trigger_spell_1,
        spell.effect_trigger_spell_2
    ]) AS triggered(spell_id)
    WHERE triggered.spell_id <> 0
      AND NOT triggered.spell_id = ANY(graph.path)
      AND cardinality(graph.path) < 8
)
INSERT INTO dbc_consumable_buffs (dataset_id, item_id, spell_id, spell_name)
SELECT DISTINCT
    graph.dataset_id,
    graph.item_id,
    spell.spell_id,
    spell.name
FROM spell_graph graph
JOIN dbc_spells spell
  ON spell.dataset_id = graph.dataset_id
 AND spell.spell_id = graph.spell_id
WHERE spell.effect_0 IN (6, 174)
   OR spell.effect_1 IN (6, 174)
   OR spell.effect_2 IN (6, 174);

COMMIT;
