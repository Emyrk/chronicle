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

-- name: BaselineInstancePlayerGuilds :many
SELECT guild.* FROM guilds guild
WHERE guild.id IN (
    SELECT player.guild_id FROM log_instance_players player
    WHERE player.instance_id = $1
);

-- Baseline armory export requires a public parse with an empty shared armory
-- seed. Current-player rows do not otherwise provide a historical write set.
-- name: BaselineSharedArmoryCounts :one
SELECT (SELECT count(*) FROM guilds)::bigint AS guilds,
       (SELECT count(*) FROM game_players)::bigint AS players,
       (SELECT count(*) FROM game_player_gear_history)::bigint AS gear;

-- name: BaselinePublishedGuilds :many
SELECT guild.* FROM guilds guild
WHERE guild.realm_id IN (SELECT realm_id FROM log_instances WHERE log_group_id = $1);

-- name: BaselinePublishedPlayers :many
SELECT player.* FROM game_players player
WHERE player.updated_from_instance IN (SELECT id FROM log_instances WHERE log_group_id = $1);

-- name: BaselinePublishedGear :many
SELECT gear.* FROM game_player_gear_history gear
WHERE gear.instance_id IN (SELECT id FROM log_instances WHERE log_group_id = $1);

-- name: BaselineLoot :many
SELECT loot.* FROM instance_loot loot
WHERE loot.instance_id IN (SELECT id FROM log_instances WHERE log_group_id = $1);

-- name: BaselineOverview :many
SELECT metrics.* FROM instance_overview_metrics metrics
WHERE metrics.instance_id IN (SELECT id FROM log_instances WHERE log_group_id = $1);

-- name: BaselineSpeedruns :many
SELECT speedrun.* FROM instance_speedruns speedrun
WHERE speedrun.instance_id IN (SELECT id FROM log_instances WHERE log_group_id = $1);
