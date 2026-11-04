-- Replace a single logical run atomically. DELETE triggers record old subjects
-- and cohorts; INSERT triggers record new subjects and cohorts, including a
-- guildless clean kill's contribution to the tenant Peak denominator.
-- name: DeleteLivePlayerObservationsForRun :execrows
DELETE FROM rating_live_player_observations
WHERE tenant_id = @tenant_id AND run_id = @run_id;

-- name: DeleteLiveGuildObservationsForRun :execrows
DELETE FROM rating_live_guild_observations
WHERE tenant_id = @tenant_id AND run_id = @run_id;

-- Match StageRatingPlayerRuns, except live evidence has no generation cutoff.
-- The latest eligible locked parse is picked again if score results change.
-- name: InsertLivePlayerObservationsForRun :execrows
INSERT INTO rating_live_player_observations
    (tenant_id, realm_id, run_id, representative_instance_id, player_guid,
     instance_name, encounter_name, difficulty_name, max_players, player_class,
     player_spec, player_sub_spec, killed_at, performance_metric, raw_value,
     locked_parse, duration_secs)
SELECT @tenant_id, rr.realm_id, rr.run_id, representative.id, ranking.player_guid,
       ranking.instance_name, ranking.encounter_name, ranking.difficulty_name,
       ranking.max_players, ranking.player_class, ranking.player_spec,
       ranking.player_sub_spec, ranking.killed_at, @metric::text,
       CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END,
       locked.precise_score, ranking.duration_secs::double precision
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN log_instances representative ON representative.id = rr.representative_instance_id
JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
JOIN encounter_dps_rankings ranking ON ranking.instance_id = representative.id
LEFT JOIN LATERAL (
    SELECT psr.precise_score FROM parse_score_results psr
    JOIN log_instances scored_instance ON scored_instance.id = psr.instance_id
    JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
    WHERE psr.tenant_id = @tenant_id AND psr.run_id = rr.run_id
      AND psr.encounter_name = ranking.encounter_name AND psr.player_guid = ranking.player_guid
      AND psr.instance_name = ranking.instance_name AND psr.difficulty_name = ranking.difficulty_name
      AND psr.max_players = ranking.max_players AND psr.player_class = ranking.player_class
      AND psr.player_spec = ranking.player_spec AND psr.player_sub_spec = ranking.player_sub_spec
      AND psr.metric = @metric::text AND psr.status IN ('ok', 'low_confidence')
    ORDER BY psr.created_at DESC, psr.precise_score DESC, psr.id LIMIT 1
) locked ON true
WHERE rr.run_id = @run_id AND representative.invalidated_at IS NULL
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND ranking.encounter_id IS NOT NULL AND ranking.duration_secs > 0
  AND @metric::text IN ('dps', 'hps')
  AND (CASE WHEN @metric::text = 'hps' THEN ranking.hps ELSE ranking.dps END) > 0;

-- Match StageRatingGuildRuns: choose the fastest clean boss kill per run,
-- including guildless observations used to calculate rank one.
-- name: InsertLiveGuildObservationsForRun :execrows
INSERT INTO rating_live_guild_observations
    (tenant_id, realm_id, run_id, representative_instance_id, guild_id,
     instance_name, encounter_name, difficulty_name, max_players, killed_at,
     raw_duration_ms, locked_parse)
SELECT DISTINCT ON (rr.run_id, encounter.name)
       @tenant_id, rr.realm_id, rr.run_id, representative.id, representative.guild_id,
       representative.name, encounter.name, representative.difficulty_name,
       representative.max_players::smallint, encounter.end_time,
       (EXTRACT(EPOCH FROM (encounter.end_time - encounter.start_time)) * 1000)::double precision,
       boss.server_precise_score
FROM ranking_runs rr
JOIN wow_server_realms realm ON realm.id = rr.realm_id
JOIN wow_servers server ON server.id = realm.server_id
JOIN log_instances representative ON representative.id = rr.representative_instance_id
JOIN wow_log_groups log_group ON log_group.id = representative.log_group_id AND NOT log_group.unlisted
JOIN log_instance_encounters encounter ON encounter.instance_id = representative.id
LEFT JOIN LATERAL (
    SELECT b.server_precise_score FROM time_parse_scores score
    JOIN time_parse_boss_scores b ON b.time_parse_score_id = score.id
    JOIN log_instances scored_instance ON scored_instance.id = score.instance_id
    JOIN wow_log_groups scored_group ON scored_group.id = scored_instance.log_group_id AND NOT scored_group.unlisted
    WHERE score.tenant_id = @tenant_id AND score.run_id = rr.run_id
      AND score.realm_id = rr.realm_id AND score.guild_id IS NOT DISTINCT FROM representative.guild_id
      AND b.encounter_name = encounter.name AND b.server_status IN ('ok', 'low_confidence')
    ORDER BY score.computed_at DESC, score.id DESC LIMIT 1
) boss ON true
WHERE rr.run_id = @run_id AND representative.invalidated_at IS NULL
  AND server.tenant_id IS NOT DISTINCT FROM NULLIF(@tenant_id::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
  AND encounter.boss AND encounter.kill_type = 'clean' AND encounter.end_time > encounter.start_time
ORDER BY rr.run_id, encounter.name,
         (encounter.end_time - encounter.start_time), encounter.end_time, encounter.id;
