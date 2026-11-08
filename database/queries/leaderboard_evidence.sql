-- name: GetInstanceRatingEvidenceRun :one
SELECT
    li.id AS requested_instance_id,
    COALESCE(li.duplicate_group_id, li.id) AS run_id,
    rr.representative_instance_id,
    (li.invalidated_at IS NOT NULL)::boolean AS invalidated
FROM log_instances li
JOIN wow_log_groups lg ON lg.id = li.log_group_id AND NOT lg.unlisted
JOIN wow_server_realms realm ON realm.id = li.realm_id
JOIN wow_servers server ON server.id = realm.server_id AND server.tenant_id = @tenant_id::uuid
LEFT JOIN ranking_runs rr ON rr.run_id = COALESCE(li.duplicate_group_id, li.id)
WHERE li.id = @instance_id::uuid;

-- name: ListInstanceRatingPlayerObservations :many
SELECT
    observation.encounter_name,
    observation.player_guid,
    COALESCE(ranking.player_name, '')::text AS player_name,
    observation.player_class,
    observation.player_spec,
    observation.player_sub_spec,
    observation.metric,
    observation.metric_value,
    observation.source_instance_id,
    observation.source_encounter_id,
    observation.source_ranking_id,
    observation.projection_version,
    observation.observed_at
FROM leaderboard_player_observations observation
LEFT JOIN encounter_dps_rankings ranking
    ON ranking.id = observation.source_ranking_id
   AND ranking.instance_id = observation.source_instance_id
   AND ranking.encounter_id = observation.source_encounter_id
   AND ranking.player_guid = observation.player_guid
WHERE observation.tenant_id = @tenant_id::uuid
  AND observation.run_id = @run_id::uuid
ORDER BY observation.encounter_name, observation.player_guid;

-- name: ListInstanceRatingPlayerRenownFacts :many
SELECT
    fact.encounter_name,
    fact.player_guid,
    COALESCE(player.name, '')::text AS player_name,
    fact.source_instance_id,
    fact.source_encounter_id,
    fact.projection_version,
    fact.observed_at
FROM leaderboard_player_renown_facts fact
LEFT JOIN log_instance_players player
    ON player.instance_id = fact.source_instance_id
   AND player.unit_guid::text = fact.player_guid
WHERE fact.tenant_id = @tenant_id::uuid
  AND fact.run_id = @run_id::uuid
ORDER BY fact.encounter_name, fact.player_guid;

-- name: ListInstanceRatingGuildBossObservations :many
SELECT
    observation.encounter_name,
    observation.guild_id,
    COALESCE(guild.name, '')::text AS guild_name,
    observation.duration_ms,
    observation.source_instance_id,
    observation.source_encounter_id,
    observation.source_time_parse_score_id,
    observation.projection_version,
    observation.observed_at
FROM leaderboard_guild_boss_observations observation
LEFT JOIN guilds guild ON guild.id = observation.guild_id AND guild.realm_id = observation.realm_id
WHERE observation.tenant_id = @tenant_id::uuid
  AND observation.run_id = @run_id::uuid
ORDER BY observation.encounter_name, observation.guild_id;

-- name: ListInstanceRatingGuildClearObservations :many
SELECT
    observation.guild_id,
    COALESCE(guild.name, '')::text AS guild_name,
    observation.duration_ms,
    observation.source_instance_id,
    observation.source_time_parse_score_id,
    observation.projection_version,
    observation.observed_at
FROM leaderboard_guild_clear_observations observation
LEFT JOIN guilds guild ON guild.id = observation.guild_id AND guild.realm_id = observation.realm_id
WHERE observation.tenant_id = @tenant_id::uuid
  AND observation.run_id = @run_id::uuid
ORDER BY observation.guild_id;

-- name: ListInstanceRatingGuildRenownFacts :many
SELECT
    fact.encounter_name,
    fact.guild_id,
    COALESCE(guild.name, '')::text AS guild_name,
    fact.source_instance_id,
    fact.source_encounter_id,
    fact.projection_version,
    fact.observed_at
FROM leaderboard_guild_renown_facts fact
LEFT JOIN guilds guild ON guild.id = fact.guild_id AND guild.realm_id = fact.realm_id
WHERE fact.tenant_id = @tenant_id::uuid
  AND fact.run_id = @run_id::uuid
ORDER BY fact.encounter_name, fact.guild_id;
