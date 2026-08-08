-- name: DeleteConsumablesByDataset :exec
DELETE FROM dbc_consumables WHERE dataset_id = @dataset_id;

-- name: InsertDerivedConsumables :execrows
WITH eligible_item_spells AS (
    SELECT
        wit.dataset_id,
        wit.entry AS item_id,
        array_agg(slot.spell_id ORDER BY slot.slot) AS item_spell_ids
    FROM world_item_template wit
    CROSS JOIN LATERAL (VALUES
        (1, wit.spellid_1, wit.spelltrigger_1),
        (2, wit.spellid_2, wit.spelltrigger_2),
        (3, wit.spellid_3, wit.spelltrigger_3),
        (4, wit.spellid_4, wit.spelltrigger_4),
        (5, wit.spellid_5, wit.spelltrigger_5)
    ) AS slot(slot, spell_id, trigger)
    LEFT JOIN dbc_spells spell
      ON spell.dataset_id = wit.dataset_id
     AND spell.spell_id = slot.spell_id
    WHERE wit.dataset_id = @dataset_id
      AND slot.spell_id <> 0
      AND slot.trigger = 0
      -- Codices use a normal on-use item trigger, but the root spell teaches
      -- another spell instead of producing a consumable effect.
      AND (
          spell.spell_id IS NULL
          OR 36 NOT IN (spell.effect_0, spell.effect_1, spell.effect_2)
      )
    GROUP BY wit.dataset_id, wit.entry
)
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
    eligible.item_spell_ids
FROM world_item_template wit
JOIN eligible_item_spells eligible
  ON eligible.dataset_id = wit.dataset_id
 AND eligible.item_id = wit.entry
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
                    AND spell.spell_id = ANY(eligible.item_spell_ids)
                    AND (
                        spell.effect_0 IN (6, 174) OR
                        spell.effect_1 IN (6, 174) OR
                        spell.effect_2 IN (6, 174)
                    )
              )
          )
      )
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
    CROSS JOIN LATERAL (VALUES
        (spell.effect_0, spell.effect_trigger_spell_0),
        (spell.effect_1, spell.effect_trigger_spell_1),
        (spell.effect_2, spell.effect_trigger_spell_2)
    ) AS triggered(effect, spell_id)
    -- A learn-spell effect names the taught spell in this field; it does not
    -- execute that spell and must not create a consumable buff edge.
    WHERE triggered.effect <> 36
      AND triggered.spell_id <> 0
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
