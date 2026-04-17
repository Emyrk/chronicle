ALTER TABLE instance_speedruns
    ADD COLUMN addon_version TEXT NOT NULL DEFAULT '',
    ADD COLUMN parser_version_num BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN addon_version_num BIGINT NOT NULL DEFAULT 0;

CREATE TABLE leaderboard_version_requirements (
    instance_name TEXT PRIMARY KEY,
    min_parser_version TEXT NOT NULL DEFAULT '',
    min_parser_version_num BIGINT NOT NULL DEFAULT 0,
    min_addon_version TEXT NOT NULL DEFAULT '',
    min_addon_version_num BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
