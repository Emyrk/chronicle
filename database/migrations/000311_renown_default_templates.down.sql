BEGIN;

DROP TRIGGER rating_policy_seed_renown ON rating_group_policies;
DROP FUNCTION apply_rating_renown_template();
DROP TABLE rating_renown_template_bosses;
DROP TABLE rating_renown_templates;

-- The old split cannot be reconstructed after admin edits. Preserve effective
-- points as base points and restore a zero bonus for every existing row.
ALTER TABLE rating_group_boss_policies
    ADD COLUMN final_boss_bonus DOUBLE PRECISION NOT NULL DEFAULT 0
    CHECK (final_boss_bonus >= 0);
CREATE UNIQUE INDEX rating_group_final_boss_idx ON rating_group_boss_policies
    (group_id, instance_name) WHERE final_boss_bonus > 0;

COMMIT;
