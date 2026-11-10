BEGIN;

-- Emerald Sanctum hard mode is a separate ranked boss, not a separate encounter set.
INSERT INTO leaderboard_set_members (instance_name, set_key, encounter_name) VALUES
    ('Emerald Sanctum', 'default', 'Solnius (Hard Mode)');

INSERT INTO leaderboard_member_overrides (
    layer_key, instance_name, set_key, encounter_name, enabled, position
) VALUES (
    'nightmare-of-ursol', 'Emerald Sanctum', 'default', 'Solnius (Hard Mode)', true, 3
);

UPDATE leaderboard_set_overrides
SET enabled = false
WHERE layer_key = 'nightmare-of-ursol'
  AND instance_name = 'Emerald Sanctum'
  AND set_key = 'hard';

COMMIT;
