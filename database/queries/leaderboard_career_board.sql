-- name: ListLeaderboardCareerPlayerSubjects :many
-- Every published player career row for the tenant. Mastery and Peak are
-- reduced in Go with the current weights, so rows carry inputs, not scores.
SELECT * FROM leaderboard_career_subjects
WHERE tenant_id = @tenant_id::uuid AND subject_kind = 'player'
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR realm_id = @realm_filter::uuid)
ORDER BY realm_id, subject_id, player_class, player_spec, player_sub_spec;

-- name: ListLeaderboardCareerPlayerNames :many
-- Display metadata for one page of characters, looked up after ranking.
SELECT ids.realm_id::uuid AS realm_id, ids.subject_id::text AS subject_id,
 COALESCE(p.name, ids.subject_id)::text AS player_name,
 COALESCE(p.class::text, '')::text AS player_class,
 COALESCE(g.name, '')::text AS guild_name,
 COALESCE((SELECT NULLIF(r.name, '') FROM wow_server_realms r WHERE r.id = ids.realm_id), 'Unknown realm')::text AS realm_name
FROM (SELECT unnest(@realm_ids::uuid[]) AS realm_id, unnest(@subject_ids::text[]) AS subject_id) ids
LEFT JOIN game_players p ON p.realm_id = ids.realm_id AND p.id = ids.subject_id
LEFT JOIN guilds g ON g.id = p.guild_id;
