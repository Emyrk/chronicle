-- name: EnqueueLeaderboardCareer :exec
INSERT INTO leaderboard_dirty_careers(tenant_id) VALUES (@tenant_id::uuid)
ON CONFLICT(tenant_id) DO UPDATE SET required=true,revision=leaderboard_dirty_careers.revision+1,dirtied_at=clock_timestamp(),process_after=LEAST(leaderboard_dirty_careers.process_after,clock_timestamp());

-- name: RememberLeaderboardCareerRunIdentities :exec
INSERT INTO leaderboard_career_identities(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec)
SELECT tenant_id,'player',realm_id,player_guid,player_class,player_spec,player_sub_spec FROM leaderboard_career_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
UNION
SELECT tenant_id,'guild',realm_id,guild_id::text,'','','' FROM leaderboard_guild_renown_facts WHERE tenant_id= @tenant_id::uuid AND run_id= @run_id::uuid
ON CONFLICT DO NOTHING;

-- name: ClaimLeaderboardCareer :one
WITH candidate AS (
 SELECT tenant_id FROM leaderboard_dirty_careers
 WHERE tenant_id= @tenant_id::uuid AND process_after<=clock_timestamp() AND retry_after<=clock_timestamp()
 AND (locked_until IS NULL OR locked_until<=clock_timestamp()) FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_dirty_careers d SET claim_token=gen_random_uuid(),claimed_revision=d.revision,
 pass_revision=COALESCE(d.pass_revision,d.revision), locked_until=clock_timestamp()+interval '15 minutes'
FROM candidate c WHERE d.tenant_id=c.tenant_id RETURNING d.*;

-- name: ListLeaderboardCareerIdentityPage :many
SELECT * FROM leaderboard_career_identities
WHERE tenant_id= @tenant_id::uuid AND
(subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec)>
(@after_kind::text,@after_realm::uuid,@after_subject::text,@after_class::text,@after_spec::text,@after_sub_spec::text)
ORDER BY subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec LIMIT 100;

-- name: LockLeaderboardCareerPublication :one
SELECT tenant_id FROM leaderboard_dirty_careers
WHERE tenant_id= @tenant_id::uuid AND claim_token= @claim_token::uuid
AND claimed_revision= @claimed_revision::bigint AND locked_until>clock_timestamp() FOR UPDATE;

-- name: UpsertLeaderboardCareerSubject :exec
INSERT INTO leaderboard_career_subjects(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec,chosen_metric,inputs,pool_fingerprint)
VALUES (@tenant_id::uuid,@subject_kind::text,@realm_id::uuid,@subject_id::text,@player_class::text,@player_spec::text,@player_sub_spec::text,@chosen_metric::text,@inputs::jsonb,@pool_fingerprint::text)
ON CONFLICT(tenant_id,subject_kind,realm_id,subject_id,player_class,player_spec,player_sub_spec)
DO UPDATE SET chosen_metric=EXCLUDED.chosen_metric,inputs=EXCLUDED.inputs,pool_fingerprint=EXCLUDED.pool_fingerprint,computed_at=clock_timestamp();

-- name: DeleteLeaderboardCareerSubject :exec
DELETE FROM leaderboard_career_subjects WHERE tenant_id= @tenant_id::uuid AND subject_kind= @subject_kind::text AND realm_id= @realm_id::uuid AND subject_id= @subject_id::text AND player_class= @player_class::text AND player_spec= @player_spec::text AND player_sub_spec= @player_sub_spec::text;

-- name: AdvanceLeaderboardCareer :exec
UPDATE leaderboard_dirty_careers SET cursor_kind= @cursor_kind::text,cursor_realm= @cursor_realm::uuid,cursor_subject= @cursor_subject::text,cursor_class= @cursor_class::text,cursor_spec= @cursor_spec::text,cursor_sub_spec= @cursor_sub_spec::text,
claim_token=NULL,claimed_revision=NULL,locked_until=NULL,attempts=0,retry_after='-infinity'
WHERE tenant_id= @tenant_id::uuid AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint;

-- name: CompleteLeaderboardCareer :exec
WITH done AS (
 DELETE FROM leaderboard_dirty_careers WHERE tenant_id= @tenant_id::uuid AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint AND revision=pass_revision RETURNING tenant_id
)
UPDATE leaderboard_dirty_careers SET cursor_kind='',cursor_realm='00000000-0000-0000-0000-000000000000',cursor_subject='',cursor_class='',cursor_spec='',cursor_sub_spec='',pass_revision=NULL,
claim_token=NULL,claimed_revision=NULL,locked_until=NULL,attempts=0,retry_after='-infinity'
WHERE tenant_id= @tenant_id::uuid AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint AND revision<>pass_revision;

-- name: FailLeaderboardCareer :exec
UPDATE leaderboard_dirty_careers SET claim_token=NULL,claimed_revision=NULL,locked_until=NULL,attempts=attempts+1,retry_after=clock_timestamp()+interval '30 seconds'
WHERE tenant_id= @tenant_id::uuid AND claim_token= @claim_token::uuid AND claimed_revision= @claimed_revision::bigint;

-- name: ReadLeaderboardPlayerCareers :many
SELECT * FROM leaderboard_career_subjects WHERE tenant_id= @tenant_id::uuid AND subject_kind='player' AND realm_id= @realm_id::uuid AND subject_id= @player_guid::text ORDER BY player_class,player_spec,player_sub_spec;

-- name: ReadLeaderboardGuildCareer :one
SELECT * FROM leaderboard_career_subjects WHERE tenant_id= @tenant_id::uuid AND subject_kind='guild' AND subject_id= @guild_id::text;

-- name: EnsureLeaderboardCareerSweep :exec
INSERT INTO leaderboard_dirty_careers(tenant_id,required) VALUES (@tenant_id::uuid,false) ON CONFLICT DO NOTHING;

-- name: ListDueLeaderboardCareerTenants :many
SELECT tenant_id FROM leaderboard_dirty_careers WHERE tenant_id> @after_tenant::uuid AND process_after<=clock_timestamp() AND retry_after<=clock_timestamp() AND (locked_until IS NULL OR locked_until<=clock_timestamp()) ORDER BY tenant_id LIMIT 100;

-- name: HasDueLeaderboardCareer :one
SELECT EXISTS(SELECT 1 FROM leaderboard_dirty_careers WHERE tenant_id= @tenant_id::uuid AND process_after<=clock_timestamp() AND retry_after<=clock_timestamp() AND (locked_until IS NULL OR locked_until<=clock_timestamp()));

-- name: HasPendingLeaderboardCareer :one
SELECT EXISTS(SELECT 1 FROM leaderboard_dirty_careers WHERE tenant_id= @tenant_id::uuid);

-- name: ListUnmaterializedLeaderboardPlayerCareers :many
SELECT DISTINCT f.player_class,f.player_spec,f.player_sub_spec,f.instance_name,f.difficulty_name,f.max_players
FROM leaderboard_career_renown_facts f
WHERE f.tenant_id= @tenant_id::uuid AND f.realm_id= @realm_id::uuid AND f.player_guid= @player_guid::text
AND NOT EXISTS(SELECT 1 FROM leaderboard_career_subjects s WHERE s.tenant_id=f.tenant_id AND s.subject_kind='player' AND s.realm_id=f.realm_id AND s.subject_id=f.player_guid AND s.player_class=f.player_class AND s.player_spec=f.player_spec AND s.player_sub_spec=f.player_sub_spec)
ORDER BY f.player_class,f.player_spec,f.player_sub_spec,f.instance_name,f.difficulty_name,f.max_players;

-- name: RequireCareerRealm :one
SELECT r.id FROM wow_server_realms r JOIN wow_servers s ON s.id=r.server_id WHERE r.id= @realm_id::uuid AND s.tenant_id= @tenant_id::uuid;

-- name: RequireCareerGuild :one
SELECT g.id FROM guilds g JOIN wow_server_realms r ON r.id=g.realm_id JOIN wow_servers s ON s.id=r.server_id WHERE g.id= @guild_id::uuid AND s.tenant_id= @tenant_id::uuid;
