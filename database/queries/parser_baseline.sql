-- Read-only scoped queries for temporary parser baseline tooling. Membership
-- refresh can select a representative outside this log group: include affected
-- runs, not only rows whose representative belongs to the selected group.

-- name: BaselineEncounterRankings :many
SELECT ranking.* FROM encounter_dps_rankings ranking
WHERE ranking.instance_id IN (SELECT id FROM log_instances WHERE log_group_id = $1);

-- name: BaselineTalentBuilds :many
SELECT build.* FROM talent_builds build
WHERE build.id IN (
    SELECT ranking.talent_build_id FROM encounter_dps_rankings ranking
    JOIN log_instances instance ON instance.id = ranking.instance_id
    WHERE instance.log_group_id = $1
);

-- name: BaselineRankingGuilds :many
SELECT guild.* FROM guilds guild
WHERE guild.id IN (
    SELECT ranking.guild_id FROM encounter_dps_rankings ranking
    JOIN log_instances instance ON instance.id = ranking.instance_id
    WHERE instance.log_group_id = $1
);

-- name: BaselineParseMemberships :many
SELECT membership.* FROM parse_score_memberships membership
WHERE membership.log_group_id = $1 OR membership.run_id IN (
    SELECT COALESCE(duplicate_group_id, id) FROM log_instances WHERE log_group_id = $1
);

-- name: BaselineClearMemberships :many
SELECT membership.* FROM time_parse_clear_time_memberships membership
WHERE membership.log_group_id = $1 OR membership.run_id IN (
    SELECT COALESCE(duplicate_group_id, id) FROM log_instances WHERE log_group_id = $1
);

-- name: BaselineBossMemberships :many
SELECT membership.* FROM time_parse_boss_kill_memberships membership
WHERE membership.log_group_id = $1 OR membership.run_id IN (
    SELECT COALESCE(duplicate_group_id, id) FROM log_instances WHERE log_group_id = $1
);
