-- name: UpsertGuild :one
INSERT INTO
  guilds (realm_id, name, created_at)
VALUES
  ($1, $2, $3)
ON CONFLICT (realm_id, name) DO UPDATE
  SET realm_id = EXCLUDED.realm_id  -- no-op, just to return the row
RETURNING *
;


-- name: UpsertPlayers :batchexec
-- Freeze legacy known-value clocks before advancing snapshot freshness, even when
-- incoming metadata is unknown. Unknown legacy values have no fallback clock.
INSERT INTO game_players (
  id, realm_id, name, guild_id, class, gender, race, faction, gear, level, talents, updated_from_instance, updated_at,
  name_observed_at, class_observed_at, race_observed_at, gender_observed_at, faction_observed_at, level_observed_at, guild_observed_at
) VALUES (
  sqlc.arg(id)::wow_guid,
  sqlc.arg(realm_id)::uuid,
  sqlc.arg(name)::text,
  sqlc.narg(guild_id)::uuid,
  sqlc.arg(class)::wow_playable_class,
  sqlc.arg(gender)::wow_playable_gender,
  sqlc.arg(race)::wow_playable_race,
  sqlc.narg(faction)::wow_player_faction,
  sqlc.narg(gear),
  sqlc.arg(level)::smallint,
  sqlc.narg(talents),
  sqlc.narg(updated_from_instance)::uuid,
  sqlc.arg(updated_at)::timestamptz,
  CASE WHEN sqlc.arg(name) <> '' THEN COALESCE(sqlc.narg(name_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN sqlc.arg(class) <> 'UNKNOWN' THEN COALESCE(sqlc.narg(class_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN sqlc.arg(race) <> 'Unknown' THEN COALESCE(sqlc.narg(race_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN sqlc.arg(gender) NOT IN ('Unknown', 'NotSet') THEN COALESCE(sqlc.narg(gender_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN sqlc.narg(faction) IS NOT NULL THEN COALESCE(sqlc.narg(faction_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN sqlc.arg(level) > 0 THEN COALESCE(sqlc.narg(level_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END,
  CASE WHEN (sqlc.narg(guild_id) IS NOT NULL OR sqlc.arg(guild_known)::boolean) THEN COALESCE(sqlc.narg(guild_observed_at)::timestamptz, sqlc.arg(updated_at)::timestamptz) END
)
ON CONFLICT (id, realm_id) DO UPDATE SET
  name = CASE WHEN EXCLUDED.name_observed_at > COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.name ELSE game_players.name END,
  name_observed_at = CASE WHEN EXCLUDED.name_observed_at > COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.name_observed_at ELSE COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END) END,
  class = CASE WHEN EXCLUDED.class_observed_at > COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.class ELSE game_players.class END,
  class_observed_at = CASE WHEN EXCLUDED.class_observed_at > COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.class_observed_at ELSE COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END) END,
  race = CASE WHEN EXCLUDED.race_observed_at > COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.race ELSE game_players.race END,
  race_observed_at = CASE WHEN EXCLUDED.race_observed_at > COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.race_observed_at ELSE COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END) END,
  gender = CASE WHEN EXCLUDED.gender_observed_at > COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.gender ELSE game_players.gender END,
  gender_observed_at = CASE WHEN EXCLUDED.gender_observed_at > COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.gender_observed_at ELSE COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END) END,
  faction = CASE WHEN EXCLUDED.faction_observed_at > COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.faction ELSE game_players.faction END,
  faction_observed_at = CASE WHEN EXCLUDED.faction_observed_at > COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.faction_observed_at ELSE COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END) END,
  level = CASE WHEN EXCLUDED.level_observed_at > COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.level ELSE game_players.level END,
  level_observed_at = CASE WHEN EXCLUDED.level_observed_at > COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.level_observed_at ELSE COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END) END,
  guild_id = CASE WHEN EXCLUDED.guild_observed_at > COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.guild_id ELSE game_players.guild_id END,
  guild_observed_at = CASE WHEN EXCLUDED.guild_observed_at > COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.guild_observed_at ELSE COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END) END,
  gear = CASE WHEN EXCLUDED.updated_at > game_players.updated_at AND EXCLUDED.gear IS NOT NULL AND EXCLUDED.gear <> '[]'::jsonb THEN EXCLUDED.gear ELSE game_players.gear END,
  talents = CASE WHEN EXCLUDED.updated_at > game_players.updated_at AND EXCLUDED.talents IS NOT NULL AND EXCLUDED.talents <> 'null'::jsonb THEN EXCLUDED.talents ELSE game_players.talents END,
  updated_from_instance = CASE WHEN EXCLUDED.updated_at > game_players.updated_at THEN EXCLUDED.updated_from_instance ELSE game_players.updated_from_instance END,
  updated_at = GREATEST(game_players.updated_at, EXCLUDED.updated_at);

-- name: UpsertScoutedPlayers :many
-- Payload contains one row per (id, realm_id), with required name and observed_at.
-- Explicit per-field clocks are required to update metadata; observed_at is only
-- a last-seen fallback and guild creation time, never a known-observation clock.
-- Strict > guards make equal timestamps first-writer-wins (retries are no-ops).
-- Null/unknown fields are not observations. guild_known=true and empty guild_name
-- explicitly observes guildlessness; false means membership was not observed.
-- Scouting-only rows use -infinity snapshot freshness so any real gear can follow.
WITH observations AS (
  SELECT
    (value->>'id')::wow_guid AS id,
    (value->>'realm_id')::uuid AS realm_id,
    (value->>'name')::text AS name,
    (value->>'class')::wow_playable_class AS class,
    (value->>'race')::wow_playable_race AS race,
    (value->>'gender')::wow_playable_gender AS gender,
    (value->>'faction')::wow_player_faction AS faction,
    (value->>'level')::smallint AS level,
    (value->>'guild_name')::text AS guild_name,
    (value->>'guild_known')::boolean AS guild_known,
    (value->>'observed_at')::timestamptz AS observed_at,
    (value->>'scouting_last_seen_at')::timestamptz AS scouting_last_seen_at,
    (value->>'name_observed_at')::timestamptz AS name_observed_at,
    (value->>'class_observed_at')::timestamptz AS class_observed_at,
    (value->>'race_observed_at')::timestamptz AS race_observed_at,
    (value->>'gender_observed_at')::timestamptz AS gender_observed_at,
    (value->>'faction_observed_at')::timestamptz AS faction_observed_at,
    (value->>'level_observed_at')::timestamptz AS level_observed_at,
    (value->>'guild_observed_at')::timestamptz AS guild_observed_at
  FROM jsonb_array_elements(sqlc.arg(payload)::jsonb)
), observed_guilds AS (
  INSERT INTO guilds (realm_id, name, created_at)
  SELECT realm_id, guild_name, min(observed_at)
  FROM observations WHERE guild_known AND COALESCE(guild_name, '') <> ''
  GROUP BY realm_id, guild_name
  ORDER BY realm_id, guild_name
  ON CONFLICT (realm_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id, realm_id, name
), upserted_players AS (
INSERT INTO game_players (
  id, realm_id, name, class, race, gender, faction, level, guild_id, updated_at,
  name_observed_at, class_observed_at, race_observed_at, gender_observed_at,
  faction_observed_at, level_observed_at, guild_observed_at, scouting_last_seen_at
)
SELECT o.id, o.realm_id, o.name, COALESCE(o.class, 'UNKNOWN'),
  COALESCE(o.race, 'Unknown'), COALESCE(o.gender, 'Unknown'), o.faction,
  COALESCE(o.level, 0), g.id, '-infinity'::timestamptz,
  CASE WHEN o.name <> '' THEN o.name_observed_at END,
  CASE WHEN o.class <> 'UNKNOWN' THEN o.class_observed_at END,
  CASE WHEN o.race <> 'Unknown' THEN o.race_observed_at END,
  CASE WHEN o.gender NOT IN ('Unknown', 'NotSet') THEN o.gender_observed_at END,
  CASE WHEN o.faction IS NOT NULL THEN o.faction_observed_at END,
  CASE WHEN o.level > 0 THEN o.level_observed_at END,
  CASE WHEN o.guild_known THEN o.guild_observed_at END, COALESCE(o.scouting_last_seen_at, o.observed_at)
FROM observations o LEFT JOIN observed_guilds g
  ON g.realm_id = o.realm_id AND g.name = o.guild_name AND o.guild_known
ORDER BY o.realm_id, o.id
ON CONFLICT (id, realm_id) DO UPDATE SET
  name = CASE WHEN EXCLUDED.name_observed_at > COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.name ELSE game_players.name END,
  name_observed_at = CASE WHEN EXCLUDED.name_observed_at > COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.name_observed_at ELSE COALESCE(game_players.name_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.name <> '' THEN game_players.updated_at END) END,
  class = CASE WHEN EXCLUDED.class_observed_at > COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.class ELSE game_players.class END,
  class_observed_at = CASE WHEN EXCLUDED.class_observed_at > COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.class_observed_at ELSE COALESCE(game_players.class_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.class <> 'UNKNOWN' THEN game_players.updated_at END) END,
  race = CASE WHEN EXCLUDED.race_observed_at > COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.race ELSE game_players.race END,
  race_observed_at = CASE WHEN EXCLUDED.race_observed_at > COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.race_observed_at ELSE COALESCE(game_players.race_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.race <> 'Unknown' THEN game_players.updated_at END) END,
  gender = CASE WHEN EXCLUDED.gender_observed_at > COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.gender ELSE game_players.gender END,
  gender_observed_at = CASE WHEN EXCLUDED.gender_observed_at > COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.gender_observed_at ELSE COALESCE(game_players.gender_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.gender NOT IN ('Unknown', 'NotSet') THEN game_players.updated_at END) END,
  faction = CASE WHEN EXCLUDED.faction_observed_at > COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.faction ELSE game_players.faction END,
  faction_observed_at = CASE WHEN EXCLUDED.faction_observed_at > COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.faction_observed_at ELSE COALESCE(game_players.faction_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.faction IS NOT NULL THEN game_players.updated_at END) END,
  level = CASE WHEN EXCLUDED.level_observed_at > COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.level ELSE game_players.level END,
  level_observed_at = CASE WHEN EXCLUDED.level_observed_at > COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.level_observed_at ELSE COALESCE(game_players.level_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.level > 0 THEN game_players.updated_at END) END,
  guild_id = CASE WHEN EXCLUDED.guild_observed_at > COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.guild_id ELSE game_players.guild_id END,
  guild_observed_at = CASE WHEN EXCLUDED.guild_observed_at > COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END, '-infinity'::timestamptz) THEN EXCLUDED.guild_observed_at ELSE COALESCE(game_players.guild_observed_at, CASE WHEN game_players.scouting_last_seen_at IS NULL AND game_players.guild_id IS NOT NULL THEN game_players.updated_at END) END,
  scouting_last_seen_at = GREATEST(game_players.scouting_last_seen_at, EXCLUDED.scouting_last_seen_at)
RETURNING game_players.id, game_players.realm_id, game_players.guild_id
)
SELECT p.id, p.guild_id, g.id AS observed_guild_id
FROM upserted_players p
JOIN observations o ON o.id = p.id AND o.realm_id = p.realm_id
LEFT JOIN observed_guilds g ON g.realm_id = o.realm_id AND g.name = o.guild_name AND o.guild_known;

-- name: UpsertPlayerGearHistory :batchexec
INSERT INTO
  game_player_gear_history (
    player_id, realm_id, instance_id,
    gear, avg_ilvl, equipped_at
  )
VALUES
  ($1, $2, $3, $4, $5, $6)
ON CONFLICT (player_id, realm_id, instance_id) DO UPDATE
  SET gear = EXCLUDED.gear,
      avg_ilvl = EXCLUDED.avg_ilvl,
      equipped_at = EXCLUDED.equipped_at;
;


-- name: GetPlayerGearHistory :many
SELECT
  h.instance_id,
  h.gear,
  h.avg_ilvl,
  h.equipped_at,
  li.name as instance_name,
  li.hashed_slug as instance_slug
FROM
  game_player_gear_history h
JOIN log_instances li ON li.id = h.instance_id
JOIN wow_log_groups log_group ON log_group.id = li.log_group_id AND NOT log_group.unlisted
WHERE
  h.realm_id = @realm_id
  AND h.player_id = @player_id
ORDER BY
  h.equipped_at DESC
LIMIT @result_limit
;


-- name: GetGamePlayerByGUID :one
SELECT
  gp.*,
  COALESCE(wow_server_realms.name, 'Unknown') as realm_name,
  g.name as guild_name
FROM
  game_players gp
LEFT JOIN guilds g ON g.id = gp.guild_id
JOIN wow_server_realms ON gp.realm_id = wow_server_realms.id
WHERE
  gp.realm_id = @realm_id
  AND (gp.id = @identifier::wow_guid OR lower(gp.name) = lower(@name))
;


-- name: SearchGamePlayers :many
SELECT
  gp.id,
  gp.realm_id,
  gp.name,
  gp.class,
  gp.race,
  gp.gender,
  gp.level,
  gp.guild_id,
  gp.updated_at,
  COALESCE(wow_server_realms.name, 'Unknown') as realm_name,
  COALESCE(g.name, '') as guild_name
FROM
  game_players gp
LEFT JOIN guilds g ON g.id = gp.guild_id
JOIN wow_server_realms ON gp.realm_id = wow_server_realms.id
WHERE
  gp.name ILIKE @search_term || '%'
  AND CASE
    WHEN @filter_class::text != '' THEN gp.class::text = @filter_class
    ELSE true
  END
  AND CASE
    WHEN @filter_realm::uuid != '00000000-0000-0000-0000-000000000000' THEN gp.realm_id = @filter_realm
    ELSE true
  END
  AND CASE
    WHEN @filter_guild::text != '' THEN g.name ILIKE '%' || @filter_guild || '%'
    ELSE true
  END
ORDER BY
  gp.level DESC, gp.updated_at DESC
LIMIT @result_limit
OFFSET @result_offset
;

-- name: CensusPlayerCounts :many
-- JOINs wow_server_realms so RLS tenant filtering cascades.
SELECT
  gp.class,
  gp.race,
  gp.faction,
  COUNT(*) AS count
FROM game_players gp
JOIN wow_server_realms wsr ON wsr.id = gp.realm_id
WHERE gp.updated_at >= @updated_after::timestamptz
  AND (cardinality(@realm_ids::uuid[]) = 0 OR gp.realm_id = ANY(@realm_ids::uuid[]))
GROUP BY gp.class, gp.race, gp.faction
ORDER BY gp.class, gp.race, gp.faction;
