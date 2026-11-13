BEGIN;

DELETE FROM leaderboard_member_overrides WHERE
    (layer_key, instance_name, set_key, encounter_name, enabled, position) IN (VALUES
        ('tbc', 'Magtheridon''s Lair', 'default', 'Magtheridon', true, 1));

DELETE FROM leaderboard_set_overrides WHERE
    (layer_key, instance_name, set_key, enabled) IN (VALUES
        ('tbc', 'Magtheridon''s Lair', 'default', true));

DELETE FROM leaderboard_set_members WHERE
    (instance_name, set_key, encounter_name) IN (VALUES
        ('Magtheridon''s Lair', 'default', 'Magtheridon'));

DELETE FROM leaderboard_sets WHERE
    (instance_name, set_key, name) IN (VALUES
        ('Magtheridon''s Lair', 'default', 'Normal'));

COMMIT;
