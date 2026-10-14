-- name: GetLogInstanceForTimeParse :one
-- Return the cohort dimensions and logical run identity for live time parsing.
SELECT
    instance.name AS instance_name,
    instance.difficulty_name,
    instance.max_players,
    COALESCE(instance.duplicate_group_id, instance.id) AS run_id
FROM log_instances instance
WHERE instance.id = @id;

-- name: ListTimeParseReplacementLogGroups :many
-- Locate surviving uploads for a logical run before deleting one instance so
-- compact memberships can elect a new representative afterward.
SELECT DISTINCT instance.log_group_id
FROM log_instances instance
WHERE COALESCE(instance.duplicate_group_id, instance.id) = @run_id
  AND instance.id <> @instance_id;

-- name: ListTimeParseReplacementLogGroupsForDeletedLogGroup :many
-- Locate surviving uploads for logical runs whose source log group is deleted.
SELECT DISTINCT instance.log_group_id
FROM log_instances instance
WHERE COALESCE(instance.duplicate_group_id, instance.id) = ANY(@run_ids::uuid[])
  AND instance.log_group_id <> @log_group_id;
