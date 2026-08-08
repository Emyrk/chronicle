-- name: DeleteConsumablesByDataset :exec
DELETE FROM dbc_consumables WHERE dataset_id = @dataset_id;

-- name: InsertDerivedConsumables :execrows
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
        CASE WHEN wit.spelltrigger_1 = 0 THEN wit.spellid_1 ELSE 0 END,
        CASE WHEN wit.spelltrigger_2 = 0 THEN wit.spellid_2 ELSE 0 END,
        CASE WHEN wit.spelltrigger_3 = 0 THEN wit.spellid_3 ELSE 0 END,
        CASE WHEN wit.spelltrigger_4 = 0 THEN wit.spellid_4 ELSE 0 END,
        CASE WHEN wit.spelltrigger_5 = 0 THEN wit.spellid_5 ELSE 0 END
    ], 0)::int[]
FROM world_item_template wit
LEFT JOIN world_display_info wdi
    ON wdi.dataset_id = wit.dataset_id AND wdi.id = wit.display_id
LEFT JOIN dbc_item_display_info dbi
    ON dbi.dataset_id = wit.dataset_id AND dbi.id = wit.display_id
WHERE wit.dataset_id = @dataset_id
  AND (
      wit.class = 0
      OR (
          wit.inventory_type = 0
          AND (
              (wit.spellid_1 <> 0 AND wit.spelltrigger_1 = 0) OR
              (wit.spellid_2 <> 0 AND wit.spelltrigger_2 = 0) OR
              (wit.spellid_3 <> 0 AND wit.spelltrigger_3 = 0) OR
              (wit.spellid_4 <> 0 AND wit.spelltrigger_4 = 0) OR
              (wit.spellid_5 <> 0 AND wit.spelltrigger_5 = 0)
          )
          AND (
              wit.stackable > 1
              OR (
                  -- Weapon oils are trade goods with multiple expendable charges,
                  -- rather than stackable items or direct aura spells.
                  wit.class = 7
                  AND (
                      (wit.spellid_1 <> 0 AND wit.spelltrigger_1 = 0 AND wit.spellcharges_1 < 0) OR
                      (wit.spellid_2 <> 0 AND wit.spelltrigger_2 = 0 AND wit.spellcharges_2 < 0) OR
                      (wit.spellid_3 <> 0 AND wit.spelltrigger_3 = 0 AND wit.spellcharges_3 < 0) OR
                      (wit.spellid_4 <> 0 AND wit.spelltrigger_4 = 0 AND wit.spellcharges_4 < 0) OR
                      (wit.spellid_5 <> 0 AND wit.spelltrigger_5 = 0 AND wit.spellcharges_5 < 0)
                  )
              )
              OR EXISTS (
                  SELECT 1
                  FROM dbc_spells spell
                  WHERE spell.dataset_id = wit.dataset_id
                    AND (
                        (spell.spell_id = wit.spellid_1 AND wit.spelltrigger_1 = 0) OR
                        (spell.spell_id = wit.spellid_2 AND wit.spelltrigger_2 = 0) OR
                        (spell.spell_id = wit.spellid_3 AND wit.spelltrigger_3 = 0) OR
                        (spell.spell_id = wit.spellid_4 AND wit.spelltrigger_4 = 0) OR
                        (spell.spell_id = wit.spellid_5 AND wit.spelltrigger_5 = 0)
                    )
                    AND (
                        spell.effect_0 IN (6, 174) OR
                        spell.effect_1 IN (6, 174) OR
                        spell.effect_2 IN (6, 174)
                    )
              )
          )
      )
  )
  AND (
      -- Trigger 0 is an actual on-use spell. Other triggers describe equip,
      -- proc, or learning behavior and must not create consume events.
      (wit.spellid_1 <> 0 AND wit.spelltrigger_1 = 0) OR
      (wit.spellid_2 <> 0 AND wit.spelltrigger_2 = 0) OR
      (wit.spellid_3 <> 0 AND wit.spelltrigger_3 = 0) OR
      (wit.spellid_4 <> 0 AND wit.spelltrigger_4 = 0) OR
      (wit.spellid_5 <> 0 AND wit.spelltrigger_5 = 0)
  );

-- name: InsertDerivedConsumableBuffs :execrows
WITH RECURSIVE roots AS (
    SELECT
        c.dataset_id,
        c.item_id,
        root_spell_id
    FROM dbc_consumables c
    CROSS JOIN LATERAL unnest(c.item_spell_ids) AS root_spell_id
    WHERE c.dataset_id = @dataset_id
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

-- name: ListConsumablesByDataset :many
SELECT
    c.item_id,
    c.item_name,
    c.item_quality,
    c.item_icon,
    c.item_spell_ids,
    b.spell_id AS buff_spell_id,
    b.spell_name AS buff_spell_name
FROM dbc_consumables c
LEFT JOIN dbc_consumable_buffs b
  ON b.dataset_id = c.dataset_id
 AND b.item_id = c.item_id
WHERE c.dataset_id = @dataset_id
ORDER BY c.item_name, c.item_id, b.spell_name, b.spell_id;

-- name: UpsertConsumableDisambiguationIfCandidate :one
INSERT INTO dataset_consumable_disambiguations (dataset_id, effect_kind, spell_id, item_id, ignored)
SELECT @dataset_id, @effect_kind, @spell_id, @item_id, FALSE
WHERE (
    @effect_kind = 'buff'
    AND EXISTS (
        SELECT 1 FROM dbc_consumable_buffs b
        WHERE b.dataset_id = @dataset_id
          AND b.spell_id = @spell_id
          AND b.item_id = @item_id
    )
) OR (
    @effect_kind = 'direct'
    AND EXISTS (
        SELECT 1 FROM dbc_consumables c
        WHERE c.dataset_id = @dataset_id
          AND c.item_id = @item_id
          AND @spell_id = ANY(c.item_spell_ids)
    )
)
ON CONFLICT (dataset_id, effect_kind, spell_id) DO UPDATE
SET item_id = EXCLUDED.item_id, ignored = FALSE, updated_at = now()
RETURNING effect_kind, spell_id, item_id;

-- name: IgnoreConsumableEffectIfCandidate :one
INSERT INTO dataset_consumable_disambiguations (dataset_id, effect_kind, spell_id, item_id, ignored)
SELECT @dataset_id, @effect_kind, @spell_id, NULL, TRUE
WHERE (
    @effect_kind = 'buff'
    AND EXISTS (
        SELECT 1 FROM dbc_consumable_buffs b
        WHERE b.dataset_id = @dataset_id
          AND b.spell_id = @spell_id
    )
) OR (
    @effect_kind = 'direct'
    AND EXISTS (
        SELECT 1 FROM dbc_consumables c
        WHERE c.dataset_id = @dataset_id
          AND @spell_id = ANY(c.item_spell_ids)
    )
)
ON CONFLICT (dataset_id, effect_kind, spell_id) DO UPDATE
SET item_id = NULL, ignored = TRUE, updated_at = now()
RETURNING effect_kind, spell_id, ignored;

-- name: DeleteConsumableDisambiguation :exec
DELETE FROM dataset_consumable_disambiguations
WHERE dataset_id = @dataset_id
  AND effect_kind = @effect_kind
  AND spell_id = @spell_id;

-- name: ListConsumableEffectPoliciesByDataset :many
SELECT effect_kind, spell_id, item_id, ignored
FROM dataset_consumable_disambiguations
WHERE dataset_id = @dataset_id
ORDER BY effect_kind, spell_id;

-- name: ListConsumableDisambiguationsByDataset :many
SELECT effect_kind, spell_id, item_id
FROM dataset_consumable_disambiguations
WHERE dataset_id = @dataset_id
  AND ignored = FALSE
  AND item_id IS NOT NULL
ORDER BY effect_kind, spell_id;
