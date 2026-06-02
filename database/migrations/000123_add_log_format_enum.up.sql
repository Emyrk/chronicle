-- LogFormat is the parse-format axis split out of log_type (format vs flavor vs
-- dataset). The four formats map to the four logging tools that produce logs.
-- See TODO_DATASETS.md "Log Format / Flavor Split".
-- Names encode the client build + the specific logging tool, because the same
-- game content can run on a different client build (e.g. vanilla content on a
-- 3.3.5a client). The format identifies the addon/mod, not the content flavor.
BEGIN;

CREATE TYPE log_format AS ENUM (
    '1.12a-superwow-addon',  -- 1.12a client, SuperWoWCombatLogger
    '1.12a-cc-addon',        -- 1.12a client, ChronicleCompanion addon
    '3.3.5a-cc-addon',       -- 3.3.5a client, ChronicleCompanionWoTLK addon
    'azerothcore-mod'        -- mod-chronicle (serverside)
);

-- Nullable for now: no code writes `format` yet, so a NOT NULL constraint would
-- break inserts. A later consumer PR populates it on insert and tightens this.
ALTER TABLE wow_log_groups
    ADD COLUMN format log_format;

-- Backfill existing rows from log_type. This CASE must stay in sync with the
-- Go mapping in database/logformat.go (LogType.Format); the latter is the
-- runtime source of truth and is guarded by exhaustive tests.
UPDATE wow_log_groups
SET format = CASE log_type
    WHEN 'v1'                     THEN '1.12a-superwow-addon'
    WHEN 'v2'                     THEN '1.12a-cc-addon'
    WHEN 'kronos'                 THEN '1.12a-cc-addon'
    WHEN 'warmane'                THEN '3.3.5a-cc-addon'
    WHEN 'epoch'                  THEN '3.3.5a-cc-addon'
    WHEN 'azerothcore-clientside' THEN '3.3.5a-cc-addon'
    WHEN 'azerothcore'            THEN 'azerothcore-mod'
END::log_format;

END;
