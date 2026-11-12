-- name: PublishLeaderboardHighlights :exec
INSERT INTO leaderboard_highlights(tenant_id,instance_name,difficulty_name,max_players,realm_scope,configuration_fingerprint,source_generation,payload,refresh_started_at)
VALUES (@tenant_id::uuid,@instance_name::text,@difficulty_name::text,@max_players::smallint,@realm_scope::uuid,@configuration_fingerprint::text,@source_generation::bigint,@payload::jsonb,@refresh_started_at::timestamptz)
ON CONFLICT(tenant_id,instance_name,difficulty_name,max_players,realm_scope) DO UPDATE SET configuration_fingerprint=EXCLUDED.configuration_fingerprint,source_generation=EXCLUDED.source_generation,payload=EXCLUDED.payload,refresh_started_at=EXCLUDED.refresh_started_at,refreshed_at=clock_timestamp()
WHERE leaderboard_highlights.refresh_started_at<=EXCLUDED.refresh_started_at;

-- name: ListLeaderboardHighlights :many
SELECT * FROM leaderboard_highlights WHERE tenant_id= @tenant_id::uuid AND realm_scope= @realm_scope::uuid ORDER BY instance_name,difficulty_name,max_players LIMIT 256;

-- name: GetLeaderboardHighlightFreshness :one
SELECT configuration_fingerprint,source_generation,refreshed_at FROM leaderboard_highlights
WHERE tenant_id= @tenant_id::uuid AND realm_scope= @realm_scope::uuid
 AND instance_name= @instance_name::text AND difficulty_name= @difficulty_name::text AND max_players= @max_players::smallint;

-- name: GetLeaderboardHighlightGeneration :one
SELECT COALESCE(MAX(generation),0)::bigint FROM leaderboard_highlight_sources WHERE tenant_id= @tenant_id::uuid;

-- name: BumpLeaderboardHighlightGeneration :exec
INSERT INTO leaderboard_highlight_sources(tenant_id,generation) VALUES (@tenant_id::uuid,1)
ON CONFLICT(tenant_id) DO UPDATE SET generation=leaderboard_highlight_sources.generation+1;

-- name: LeaderboardHighlightRealms :many
SELECT r.id FROM wow_server_realms r JOIN wow_servers s ON s.id=r.server_id WHERE s.tenant_id= @tenant_id::uuid ORDER BY r.id;
