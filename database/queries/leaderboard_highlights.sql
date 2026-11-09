-- name: PublishLeaderboardHighlights :exec
INSERT INTO leaderboard_highlights(tenant_id,instance_name,difficulty_name,max_players,realm_scope,configuration_fingerprint,payload,refresh_started_at)
VALUES (@tenant_id::uuid,@instance_name::text,@difficulty_name::text,@max_players::smallint,@realm_scope::uuid,@configuration_fingerprint::text,@payload::jsonb,@refresh_started_at::timestamptz)
ON CONFLICT(tenant_id,instance_name,difficulty_name,max_players,realm_scope) DO UPDATE SET configuration_fingerprint=EXCLUDED.configuration_fingerprint,payload=EXCLUDED.payload,refresh_started_at=EXCLUDED.refresh_started_at,refreshed_at=clock_timestamp()
WHERE leaderboard_highlights.refresh_started_at<=EXCLUDED.refresh_started_at;

-- name: ListLeaderboardHighlights :many
SELECT * FROM leaderboard_highlights WHERE tenant_id= @tenant_id::uuid AND realm_scope= @realm_scope::uuid ORDER BY instance_name,difficulty_name,max_players LIMIT 256;

-- name: LeaderboardHighlightRealms :many
SELECT r.id FROM wow_server_realms r JOIN wow_servers s ON s.id=r.server_id WHERE s.tenant_id= @tenant_id::uuid ORDER BY r.id;
