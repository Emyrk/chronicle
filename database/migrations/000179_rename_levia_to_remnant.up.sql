BEGIN;

-- Levia renamed to Remnant on N'Zoth on 2026-08-26. Keep the old guild row
-- available for logs at or after the cutoff, but repoint historical log-derived
-- data to the canonical Remnant guild.
DO $$
DECLARE
  nzoth_realm_id UUID;
  levia_guild_id UUID;
  remnant_guild_id UUID;
BEGIN
  SELECT id
  INTO nzoth_realm_id
  FROM wow_server_realms
  WHERE name = 'N''Zoth';

  IF nzoth_realm_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO levia_guild_id
  FROM guilds
  WHERE realm_id = nzoth_realm_id
    AND name = 'Levia';

  IF levia_guild_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO guilds (realm_id, name, created_at)
  SELECT nzoth_realm_id, 'Remnant', created_at
  FROM guilds
  WHERE id = levia_guild_id
  ON CONFLICT (realm_id, name) DO NOTHING;

  SELECT id
  INTO remnant_guild_id
  FROM guilds
  WHERE realm_id = nzoth_realm_id
    AND name = 'Remnant';

  UPDATE log_instances
  SET guild_id = remnant_guild_id
  WHERE guild_id = levia_guild_id
    AND realm_id = nzoth_realm_id
    AND start_time < TIMESTAMPTZ '2026-08-26 00:00:00+00';

  UPDATE log_instance_players lip
  SET guild_id = remnant_guild_id
  FROM log_instances li
  WHERE lip.instance_id = li.id
    AND lip.guild_id = levia_guild_id
    AND li.realm_id = nzoth_realm_id
    AND li.start_time < TIMESTAMPTZ '2026-08-26 00:00:00+00';

  UPDATE game_players
  SET guild_id = remnant_guild_id
  WHERE guild_id = levia_guild_id
    AND realm_id = nzoth_realm_id
    AND updated_at < TIMESTAMPTZ '2026-08-26 00:00:00+00';

  UPDATE instance_speedruns speedrun
  SET guild_id = remnant_guild_id
  FROM log_instances li
  WHERE speedrun.instance_id = li.id
    AND speedrun.guild_id = levia_guild_id
    AND li.realm_id = nzoth_realm_id
    AND li.start_time < TIMESTAMPTZ '2026-08-26 00:00:00+00';

  UPDATE encounter_dps_rankings
  SET guild_id = remnant_guild_id,
      guild_name = 'Remnant'
  WHERE realm_id = nzoth_realm_id
    AND killed_at < TIMESTAMPTZ '2026-08-26 00:00:00+00'
    AND (guild_id = levia_guild_id OR guild_name = 'Levia');

  UPDATE parse_score_results score
  SET guild_id = remnant_guild_id
  FROM log_instances li
  WHERE score.instance_id = li.id
    AND score.guild_id = levia_guild_id
    AND li.realm_id = nzoth_realm_id
    AND li.start_time < TIMESTAMPTZ '2026-08-26 00:00:00+00';
END $$;

COMMIT;
