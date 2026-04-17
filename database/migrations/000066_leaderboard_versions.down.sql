DROP TABLE IF EXISTS leaderboard_version_requirements;
ALTER TABLE instance_speedruns
    DROP COLUMN IF EXISTS addon_version,
    DROP COLUMN IF EXISTS parser_version_num,
    DROP COLUMN IF EXISTS addon_version_num;
