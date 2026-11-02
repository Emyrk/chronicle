BEGIN;
DROP TABLE rating_group_boss_policies;
DROP TABLE rating_group_policies;
DROP FUNCTION bump_rating_group_policy_version();
COMMIT;
