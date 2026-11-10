-- name: ListLeaderboardCareerSubjects :many
-- Every published career row of one subject kind for the tenant. Mastery and
-- Peak are reduced in Go with the current weights, so rows carry inputs.
SELECT * FROM leaderboard_career_subjects
WHERE tenant_id = @tenant_id::uuid AND subject_kind = @subject_kind::text
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR realm_id = @realm_filter::uuid)
 AND (@player_class::text = '' OR player_class = @player_class::text)
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

-- name: ListLeaderboardCareerGuildNames :many
-- Display metadata for one page of guilds, looked up after ranking.
SELECT g.id, g.name,
 COALESCE((SELECT NULLIF(r.name, '') FROM wow_server_realms r WHERE r.id = g.realm_id), 'Unknown realm')::text AS realm_name,
 COALESCE((SELECT gp.theme->>'logo_url' FROM guild_pages gp WHERE gp.guild_id = g.id), '')::text AS logo_url
FROM guilds g WHERE g.id = ANY(@guild_ids::uuid[]);

-- name: SearchLeaderboardCareerPlayers :many
-- Characters whose name contains the search text, for filtering a ranked career board.
SELECT realm_id, id::text AS subject_id FROM game_players
WHERE position(lower(@search::text) IN lower(name)) > 0
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR realm_id = @realm_filter::uuid);

-- name: SearchLeaderboardCareerGuilds :many
-- Guilds whose name contains the search text, for filtering a ranked career board.
SELECT realm_id, id::text AS subject_id FROM guilds
WHERE position(lower(@search::text) IN lower(name)) > 0
 AND (@realm_filter::uuid = '00000000-0000-0000-0000-000000000000'::uuid OR realm_id = @realm_filter::uuid);
