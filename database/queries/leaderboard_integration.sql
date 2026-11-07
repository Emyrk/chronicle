-- name: LeaderboardRunKeysForIDs :many
-- Capture BEFORE source changes. Input may contain instance or logical-run IDs.
-- Old evidence survives source deletion/tenant movement and supplies old keys.
WITH keys AS (
 SELECT s.tenant_id, COALESCE(li.duplicate_group_id,li.id) AS run_id
 FROM log_instances li JOIN wow_server_realms r ON r.id=li.realm_id
 JOIN wow_servers s ON s.id=r.server_id
 WHERE (li.id=ANY(@ids::uuid[]) OR li.duplicate_group_id=ANY(@ids::uuid[])) AND s.tenant_id IS NOT NULL
 UNION
 SELECT s.tenant_id, rr.run_id FROM ranking_runs rr
 JOIN wow_server_realms r ON r.id=rr.realm_id JOIN wow_servers s ON s.id=r.server_id
 WHERE (rr.run_id=ANY(@ids::uuid[]) OR rr.representative_instance_id=ANY(@ids::uuid[])) AND s.tenant_id IS NOT NULL
 UNION SELECT tenant_id,run_id FROM leaderboard_player_observations WHERE run_id=ANY(@ids::uuid[]) OR source_instance_id=ANY(@ids::uuid[])
 UNION SELECT tenant_id,run_id FROM leaderboard_guild_boss_observations WHERE run_id=ANY(@ids::uuid[]) OR source_instance_id=ANY(@ids::uuid[])
 UNION SELECT tenant_id,run_id FROM leaderboard_guild_clear_observations WHERE run_id=ANY(@ids::uuid[]) OR source_instance_id=ANY(@ids::uuid[])
 UNION SELECT tenant_id,run_id FROM leaderboard_player_renown_facts WHERE run_id=ANY(@ids::uuid[]) OR source_instance_id=ANY(@ids::uuid[])
 UNION SELECT tenant_id,run_id FROM leaderboard_guild_renown_facts WHERE run_id=ANY(@ids::uuid[]) OR source_instance_id=ANY(@ids::uuid[])
) SELECT tenant_id::uuid,run_id FROM keys ORDER BY tenant_id,run_id;
