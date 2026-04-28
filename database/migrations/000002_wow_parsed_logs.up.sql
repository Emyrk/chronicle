BEGIN;

CREATE TABLE wow_servers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
)
;

CREATE TABLE wow_server_realms (
  id UUID PRIMARY KEY,
  server_id UUID NOT NULL REFERENCES wow_servers(id),
  name TEXT NOT NULL
)
;

INSERT INTO wow_servers (id, name) VALUES
  ('10ac9e23-ff74-43ed-83ad-96c123017097', 'turtle-wow')
;

INSERT INTO wow_server_realms (id, server_id, name) VALUES
  ('851d2fd3-f9c5-4623-b714-924b59d916aa', '10ac9e23-ff74-43ed-83ad-96c123017097', 'Ambershire'),
  ('f94d3103-1cd8-40e9-ad91-a2366de33354', '10ac9e23-ff74-43ed-83ad-96c123017097', 'Tel''Abim'),
  ('bcf173a7-c94a-49fe-8930-27435d722fb7','10ac9e23-ff74-43ed-83ad-96c123017097','Nordanaar')
;

CREATE TABLE parsed_log_group (
  id UUID PRIMARY KEY REFERENCES wow_log_groups(id) ON DELETE CASCADE
)
;

COMMENT ON TABLE parsed_log_group IS
  'A parsed_log_group is a wow_log_group that has been processed and contains parsed logs. A duplicate allows deleting this one row to clear all parsed logs for a given wow_log_group.'
;

CREATE TABLE log_instances (
  id UUID PRIMARY KEY,
  realm_id UUID NOT NULL REFERENCES wow_server_realms(id),
  log_group_id UUID NOT NULL REFERENCES parsed_log_group(id)
    ON DELETE CASCADE ,
  name TEXT NOT NULL
)
;

CREATE TABLE log_instance_encounters (
  id UUID PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  kill BOOLEAN NOT NULL,
  remaining wow_guid[] NOT NULL,
  boss BOOLEAN NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL
)
;

CREATE TABLE log_instance_encounter_hostiles (
  encounter_id UUID NOT NULL REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
  id wow_guid NOT NULL,
  periods activity_periods NOT NULL,

  PRIMARY KEY (encounter_id, id)
)
;

CREATE TABLE log_instance_encounter_damage_unit_summary (
  encounter_id UUID NOT NULL REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
  unit_guid wow_guid NOT NULL,
  -- Shortcut, helpful for things like pets and totems
  unit_name TEXT NOT NULL,

  -- Aggregated damage done
  damage_done_total BIGINT NOT NULL DEFAULT 0,
  -- Aggregated damage taken
  damage_taken_total BIGINT NOT NULL DEFAULT 0,
  -- JSONB for ability breakdown if needed later
  damage_done_abilities JSONB,
  damage_taken_abilities JSONB,

  is_player BOOLEAN NOT NULL,
  -- owner_guid is nullable
  owner_guid wow_guid,

  PRIMARY KEY (encounter_id, unit_guid)
);

CREATE TABLE log_instance_units (
  -- TODO: Level, class, spec, etc.
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  unit_guid wow_guid NOT NULL,
  name TEXT NOT NULL,

  -- entry matches the creature id in the game
  entry INT NOT NULL,

  -- owner_guid is nullable
  owner_guid wow_guid,

  PRIMARY KEY (instance_id, unit_guid)
);

COMMENT ON TABLE log_instance_units IS
  'Stores all units (NPCs, not players) that participated in an instance.';

CREATE TYPE wow_playable_class AS ENUM
  (
    'WARRIOR',
    'PALADIN',
    'HUNTER',
    'ROGUE',
    'PRIEST',
    'DEATH_KNIGHT',
    'SHAMAN',
    'MAGE',
    'WARLOCK',
    'DRUID',
    'MONK',
    'DEMON_HUNTER',
    'UNKNOWN'
  );

CREATE TYPE wow_playable_race AS ENUM (
  'Scourge',
  'Orc',
  'Troll',
  'Tauren',
  'Goblin',
  'Human',
  'Gnome',
  'Dwarf',
  'NightElf',
  'BloodElf',
  'Unknown'
);

CREATE TABLE log_instance_players (
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  unit_guid wow_guid NOT NULL,
  name TEXT NOT NULL,
  level INT NOT NULL,
  class wow_playable_class NOT NULL,
  race wow_playable_race NOT NULL
);


COMMIT;