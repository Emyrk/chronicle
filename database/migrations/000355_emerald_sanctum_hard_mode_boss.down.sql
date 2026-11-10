BEGIN;

UPDATE leaderboard_set_overrides
SET enabled = true
WHERE layer_key = 'nightmare-of-ursol'
  AND instance_name = 'Emerald Sanctum'
  AND set_key = 'hard';

DELETE FROM leaderboard_member_overrides
WHERE layer_key = 'nightmare-of-ursol'
  AND instance_name = 'Emerald Sanctum'
  AND set_key = 'default'
  AND encounter_name = 'Solnius (Hard Mode)';

DELETE FROM leaderboard_set_members
WHERE instance_name = 'Emerald Sanctum'
  AND set_key = 'default'
  AND encounter_name = 'Solnius (Hard Mode)';

COMMIT;
