BEGIN;

-- Approved exact career weights. Updates at most 23 small shared configuration
-- rows plus the two Vault flags; no historical evidence scan or backfill.
WITH approved(instance_name, difficulty_name, max_players, weight) AS (VALUES
    ('Onyxia''s Lair', '', 0, 1),
    ('Zul''Gurub', '', 0, 2),
    ('Ruins of Ahn''Qiraj', '', 0, 2),
    ('Molten Core', '', 0, 3),
    ('Blackwing Lair', '', 0, 4),
    ('Temple of Ahn''Qiraj', '', 0, 5),
    ('Naxxramas', '', 0, 6),
    ('Emerald Sanctum', '', 0, 1),
    ('Lower Tower of Karazhan', '', 0, 1),
    ('Timbermaw Hold', '', 0, 3),
    ('Upper Tower of Karazhan', '', 0, 6),
    ('Scarlet Monastery', '', 0, 2),
    ('Gruul''s Lair', '', 0, 1),
    ('Serpentshrine Cavern', '', 0, 4),
    ('Tempest Keep', '', 0, 3),
    ('Onyxia''s Lair', '10 Player', 10, 1),
    ('Onyxia''s Lair', '25 Player', 25, 1.5),
    ('Eye of Eternity', '10 Player', 10, 1),
    ('Eye of Eternity', '25 Player', 25, 1.5),
    ('Naxxramas', '10 Player', 10, 4),
    ('Naxxramas', '25 Player', 25, 6),
    ('Ulduar', '10 Player', 10, 6),
    ('Ulduar', '25 Player', 25, 9)
)
UPDATE leaderboard_career_variants c
SET weight = NULL
FROM approved a
WHERE (c.instance_name, c.difficulty_name, c.max_players) =
      (a.instance_name, a.difficulty_name, a.max_players)
  AND c.include_average AND c.include_renown
  AND c.weight = a.weight;

-- Vault and Obsidian Sanctum are Renown-only. Obsidian is already configured;
-- leave it untouched. Guard rollback so later edited configuration is preserved.
UPDATE leaderboard_career_variants
SET include_average = true
WHERE instance_name = 'Vault of Archavon'
  AND (difficulty_name, max_players) IN (('10 Player', 10), ('25 Player', 25))
  AND include_average = false
  AND include_renown AND weight IS NULL;

COMMIT;
