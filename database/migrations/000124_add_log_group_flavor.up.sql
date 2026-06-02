-- WoWFlavor is the server-mechanics axis (format vs flavor vs dataset). It is a
-- *set* of behavior tags, stored as text[] (the FlavorTag Go constants are the
-- vocabulary). Unlike log_format (a fixed scalar parse axis, hence an enum),
-- flavor is a growing set heading toward per-tenant runtime config, so a plain
-- text[] avoids ALTER TYPE churn.
--
-- No SQL backfill: the default flavor is build-tag dependent (services.ServerName
-- / ServerBuild) and therefore unknown in SQL. servicechronicle backfills NULL
-- rows at startup, mirroring servicedataset.ensureDefaultDataset.
BEGIN;

ALTER TABLE wow_log_groups
    ADD COLUMN flavor TEXT[];

END;
