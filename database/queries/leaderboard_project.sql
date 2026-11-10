-- One statement snapshot: no source, canonical, or dirty-row locks. Missing
-- stages yield only available evidence. No normalized parse score is selected.
-- name: ProjectLeaderboardRun :many
WITH source AS MATERIALIZED (
 SELECT rr.run_id, li.id AS source_instance_id, li.realm_id, li.guild_id,
        li.name AS instance_name, li.difficulty_name, li.max_players::smallint AS max_players,
        server.tenant_id,
        CASE lower(btrim(tenant.parse_config->>'cohort_mode'))
          WHEN 'class' THEN 'class'
          WHEN 'disabled' THEN 'disabled'
          ELSE 'spec'
        END::text AS cohort_mode
 FROM ranking_runs rr
 JOIN log_instances li ON li.id=rr.representative_instance_id
  AND COALESCE(li.duplicate_group_id,li.id)=rr.run_id
  AND li.realm_id=rr.realm_id AND li.name=rr.instance_name
  AND li.difficulty_name=rr.difficulty_name AND li.max_players=rr.max_players
 JOIN wow_log_groups lg ON lg.id=li.log_group_id AND NOT lg.unlisted
 JOIN wow_server_realms realm ON realm.id=li.realm_id
 JOIN wow_servers server ON server.id=realm.server_id AND server.tenant_id= @tenant_id::uuid
 LEFT JOIN tenants tenant ON tenant.id=server.tenant_id
 WHERE rr.run_id= @run_id::uuid AND li.invalidated_at IS NULL
), players AS MATERIALIZED (
 SELECT s.*, d.id AS ranking_id, d.player_guid, d.player_class,
        -- Rating evidence requires a non-empty spec key. Class mode collapses every
        -- source spec, including missing or unknown specs, into one stable class-only cohort.
        CASE WHEN s.cohort_mode='class' THEN 'Class' ELSE d.player_spec END::text AS player_spec,
        CASE WHEN s.cohort_mode='class' THEN '' ELSE d.player_sub_spec END::text AS player_sub_spec,
        d.dps,d.hps,e.id AS encounter_id,e.name AS encounter_name
 FROM source s JOIN encounter_dps_rankings d ON d.instance_id=s.source_instance_id
  AND d.realm_id=s.realm_id AND d.instance_name=s.instance_name
  AND d.difficulty_name=s.difficulty_name AND d.max_players=s.max_players
 JOIN log_instance_encounters e ON e.id=d.encounter_id AND e.instance_id=s.source_instance_id
  AND e.name=d.encounter_name AND e.boss AND e.kill_type='clean'
 WHERE btrim(d.player_guid)<>'' AND btrim(d.player_class)<>''
   AND (s.cohort_mode<>'spec' OR btrim(d.player_spec)<>'')
), player_candidates AS MATERIALIZED (
 SELECT players.*, 'dps'::text AS metric,dps AS metric_value FROM players
 UNION ALL SELECT players.*, 'hps'::text AS metric,hps AS metric_value FROM players
), eligible_player_metrics AS MATERIALIZED (
 -- PostgreSQL orders NaN above Infinity: this excludes both before comparison.
 SELECT * FROM player_candidates WHERE metric_value>0 AND metric_value<'Infinity'::double precision
), renown_players AS MATERIALIZED (
 -- Renown records the witnessed kill even when spec mode excludes it from ratings.
 SELECT DISTINCT ON (ranking_id) * FROM eligible_player_metrics
 ORDER BY ranking_id,metric_value DESC,metric ASC
), rating_player_metrics AS MATERIALIZED (
 SELECT * FROM eligible_player_metrics
 WHERE (cohort_mode<>'spec' OR lower(btrim(player_spec)) NOT IN ('', 'unknown'))
   AND (metric='dps' OR cohort_mode<>'spec' OR
        (upper(btrim(player_class))='PRIEST' AND lower(btrim(player_spec)) IN ('holy', 'discipline')) OR
        (upper(btrim(player_class))='DRUID' AND lower(btrim(player_spec))='restoration') OR
        (upper(btrim(player_class))='SHAMAN' AND lower(btrim(player_spec))='restoration') OR
        (upper(btrim(player_class))='PALADIN' AND lower(btrim(player_spec))='holy'))
), player_metrics AS MATERIALIZED (
 -- One raw metric per player/fight; positive ties favor DPS.
 SELECT DISTINCT ON (ranking_id) * FROM rating_player_metrics
 ORDER BY ranking_id,metric_value DESC,metric ASC
), guild_source AS MATERIALIZED (
 SELECT s.* FROM source s JOIN guilds g ON g.id=s.guild_id AND g.realm_id=s.realm_id
), guild_times AS MATERIALIZED (
 SELECT s.*, t.id AS time_score_id,t.clear_duration_ms
 FROM guild_source s JOIN time_parse_scores t ON t.instance_id=s.source_instance_id
  AND t.run_id=s.run_id AND t.tenant_id=s.tenant_id AND t.realm_id=s.realm_id AND t.guild_id=s.guild_id
), guild_bosses AS MATERIALIZED (
 SELECT s.*, b.duration_ms,e.id AS encounter_id,e.name AS encounter_name
 FROM guild_times s JOIN time_parse_boss_scores b ON b.time_parse_score_id=s.time_score_id
 JOIN log_instance_encounters e ON e.id=b.encounter_id AND e.instance_id=s.source_instance_id
  AND e.name=b.encounter_name AND e.boss AND e.kill_type='clean'
 WHERE b.duration_ms>0
), projected AS (
(SELECT DISTINCT ON (s.encounter_name,s.player_guid,s.player_class,s.player_spec,s.player_sub_spec,s.metric) 1::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, s.encounter_name AS encounter_name, s.player_guid AS player_guid, s.player_class AS player_class, s.player_spec AS player_spec, s.player_sub_spec AS player_sub_spec, s.metric AS metric, s.metric_value AS metric_value, '00000000-0000-0000-0000-000000000000'::uuid AS guild_id, s.encounter_id AS source_encounter_id, s.ranking_id AS source_ranking_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_time_parse_score_id, 0::bigint AS duration_ms
 FROM player_metrics s WHERE s.metric_value>=0 AND s.metric_value<'Infinity'::double precision
 ORDER BY s.encounter_name,s.player_guid,s.player_class,s.player_spec,s.player_sub_spec,metric,metric_value DESC,source_encounter_id,source_ranking_id)
UNION ALL
(SELECT DISTINCT ON (s.encounter_name) 2::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, s.encounter_name AS encounter_name, ''::text AS player_guid, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, ''::text AS metric, 0::double precision AS metric_value, s.guild_id AS guild_id, s.encounter_id AS source_encounter_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_ranking_id, s.time_score_id AS source_time_parse_score_id, s.duration_ms AS duration_ms
 FROM guild_bosses s
 ORDER BY s.encounter_name,s.duration_ms,s.encounter_id)
UNION ALL
(SELECT DISTINCT ON (s.guild_id) 3::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, ''::text AS encounter_name, ''::text AS player_guid, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, ''::text AS metric, 0::double precision AS metric_value, s.guild_id AS guild_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_encounter_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_ranking_id, s.time_score_id AS source_time_parse_score_id, s.clear_duration_ms AS duration_ms
 FROM guild_times s WHERE s.clear_duration_ms>0
 ORDER BY s.guild_id,s.clear_duration_ms,s.time_score_id)
UNION ALL
(SELECT DISTINCT ON (s.encounter_name,s.player_guid) 4::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, s.encounter_name AS encounter_name, s.player_guid AS player_guid, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, ''::text AS metric, 0::double precision AS metric_value, '00000000-0000-0000-0000-000000000000'::uuid AS guild_id, s.encounter_id AS source_encounter_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_ranking_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_time_parse_score_id, 0::bigint AS duration_ms
 FROM renown_players s
 ORDER BY s.encounter_name,s.player_guid,s.encounter_id)
UNION ALL
(SELECT DISTINCT ON (s.encounter_name,s.player_guid,s.player_class,s.player_spec,s.player_sub_spec) 6::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, s.encounter_name AS encounter_name, s.player_guid AS player_guid, s.player_class AS player_class, s.player_spec AS player_spec, s.player_sub_spec AS player_sub_spec, ''::text AS metric, 0::double precision AS metric_value, '00000000-0000-0000-0000-000000000000'::uuid AS guild_id, s.encounter_id AS source_encounter_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_ranking_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_time_parse_score_id, 0::bigint AS duration_ms
 FROM renown_players s WHERE s.cohort_mode='spec'
 ORDER BY s.encounter_name,s.player_guid,s.player_class,s.player_spec,s.player_sub_spec,s.encounter_id)
UNION ALL
(SELECT DISTINCT ON (e.name) 5::integer AS kind, s.tenant_id AS tenant_id, s.run_id AS run_id, s.source_instance_id AS source_instance_id, s.realm_id AS realm_id, s.instance_name AS instance_name, s.difficulty_name AS difficulty_name, s.max_players AS max_players, e.name AS encounter_name, ''::text AS player_guid, ''::text AS player_class, ''::text AS player_spec, ''::text AS player_sub_spec, ''::text AS metric, 0::double precision AS metric_value, s.guild_id AS guild_id, e.id AS source_encounter_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_ranking_id, '00000000-0000-0000-0000-000000000000'::uuid AS source_time_parse_score_id, 0::bigint AS duration_ms
 FROM guild_source s JOIN log_instance_encounters e ON e.instance_id=s.source_instance_id AND e.boss AND e.kill_type='clean'
 ORDER BY e.name,e.id)
) SELECT * FROM projected;

-- name: ReplaceLeaderboardPlayerObservation :batchexec
INSERT INTO leaderboard_player_observations (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, source_instance_id, realm_id, player_guid, source_encounter_id, source_ranking_id, player_class, player_spec, player_sub_spec, metric, metric_value, projection_version, observed_at)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @run_id::uuid, @source_instance_id::uuid, @realm_id::uuid, @player_guid::text, @source_encounter_id::uuid, @source_ranking_id::uuid, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @metric_value::double precision, 1, clock_timestamp());

-- name: ReplaceLeaderboardGuildBossObservation :batchexec
INSERT INTO leaderboard_guild_boss_observations (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, source_instance_id, realm_id, guild_id, source_time_parse_score_id, source_encounter_id, duration_ms, projection_version, observed_at)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @run_id::uuid, @source_instance_id::uuid, @realm_id::uuid, @guild_id::uuid, @source_time_parse_score_id::uuid, @source_encounter_id::uuid, @duration_ms::bigint, 1, clock_timestamp());

-- name: ReplaceLeaderboardGuildClearObservation :batchexec
INSERT INTO leaderboard_guild_clear_observations (tenant_id, instance_name, difficulty_name, max_players, run_id, source_instance_id, realm_id, guild_id, source_time_parse_score_id, duration_ms, projection_version, observed_at)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @run_id::uuid, @source_instance_id::uuid, @realm_id::uuid, @guild_id::uuid, @source_time_parse_score_id::uuid, @duration_ms::bigint, 1, clock_timestamp());

-- name: ReplaceLeaderboardPlayerRenownFact :batchexec
INSERT INTO leaderboard_player_renown_facts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, source_instance_id, realm_id, player_guid, source_encounter_id, projection_version, observed_at)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @run_id::uuid, @source_instance_id::uuid, @realm_id::uuid, @player_guid::text, @source_encounter_id::uuid, 1, clock_timestamp());

-- name: ReplaceLeaderboardGuildRenownFact :batchexec
INSERT INTO leaderboard_guild_renown_facts (tenant_id, instance_name, difficulty_name, max_players, encounter_name, run_id, source_instance_id, realm_id, guild_id, source_encounter_id, projection_version, observed_at)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @run_id::uuid, @source_instance_id::uuid, @realm_id::uuid, @guild_id::uuid, @source_encounter_id::uuid, 1, clock_timestamp());

-- name: DeleteLeaderboardRunEvidence :exec
WITH deleted0 AS (DELETE FROM leaderboard_player_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1),
deleted1 AS (DELETE FROM leaderboard_guild_boss_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1),
deleted2 AS (DELETE FROM leaderboard_guild_clear_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1),
deleted3 AS (DELETE FROM leaderboard_player_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1),
deleted4 AS (DELETE FROM leaderboard_guild_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1),
deleted5 AS (DELETE FROM leaderboard_career_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid RETURNING 1)
SELECT 1;

-- name: EnqueueLeaderboardRunEvidenceScopes :exec
WITH PlayerBossBenchmark AS (
 INSERT INTO leaderboard_dirty_player_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric FROM leaderboard_player_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric) DO UPDATE SET revision=leaderboard_dirty_player_boss_benchmarks.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_player_boss_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
),
PlayerBossSubject AS (
 INSERT INTO leaderboard_dirty_player_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid FROM leaderboard_player_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid) DO UPDATE SET revision=leaderboard_dirty_player_boss_subjects.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_player_boss_subjects.process_after,EXCLUDED.process_after) RETURNING 1
),
GuildBossBenchmark AS (
 INSERT INTO leaderboard_dirty_guild_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name FROM leaderboard_guild_boss_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name) DO UPDATE SET revision=leaderboard_dirty_guild_boss_benchmarks.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_guild_boss_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
),
GuildBossSubject AS (
 INSERT INTO leaderboard_dirty_guild_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id FROM leaderboard_guild_boss_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_boss_subjects.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_guild_boss_subjects.process_after,EXCLUDED.process_after) RETURNING 1
),
GuildClearBenchmark AS (
 INSERT INTO leaderboard_dirty_guild_clear_benchmarks (tenant_id, instance_name, difficulty_name, max_players, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players FROM leaderboard_guild_clear_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players) DO UPDATE SET revision=leaderboard_dirty_guild_clear_benchmarks.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_guild_clear_benchmarks.process_after,EXCLUDED.process_after) RETURNING 1
),
GuildClearSubject AS (
 INSERT INTO leaderboard_dirty_guild_clear_subjects (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id FROM leaderboard_guild_clear_observations WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_clear_subjects.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_guild_clear_subjects.process_after,EXCLUDED.process_after) RETURNING 1
),
PlayerRenownCount AS (
 INSERT INTO leaderboard_dirty_player_renown (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid FROM leaderboard_player_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, player_guid) DO UPDATE SET revision=leaderboard_dirty_player_renown.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_player_renown.process_after,EXCLUDED.process_after) RETURNING 1
),
GuildRenownCount AS (
 INSERT INTO leaderboard_dirty_guild_renown (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id, process_after)
 SELECT scopes.*, clock_timestamp() FROM (SELECT DISTINCT tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id FROM leaderboard_guild_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid) scopes
 ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, realm_id, guild_id) DO UPDATE SET revision=leaderboard_dirty_guild_renown.revision+1, dirtied_at=clock_timestamp(), process_after=LEAST(leaderboard_dirty_guild_renown.process_after,EXCLUDED.process_after) RETURNING 1
)
SELECT 1;

-- name: ReplaceLeaderboardCareerRenownFact :batchexec
INSERT INTO leaderboard_career_renown_facts (tenant_id,run_id,source_instance_id,realm_id,player_guid,player_class,player_spec,player_sub_spec,instance_name,difficulty_name,max_players,encounter_name,source_encounter_id)
VALUES (@tenant_id::uuid,@run_id::uuid,@source_instance_id::uuid,@realm_id::uuid,@player_guid::text,@player_class::text,@player_spec::text,@player_sub_spec::text,@instance_name::text,@difficulty_name::text,@max_players::smallint,@encounter_name::text,@source_encounter_id::uuid);
