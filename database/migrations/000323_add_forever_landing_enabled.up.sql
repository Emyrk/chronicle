BEGIN;

-- WoW Forever's "/" serves the replay landing (/start2) while this is on; off
-- reverts "/" to the standard home page. Single-row table, constant default:
-- an instant metadata-only change.
ALTER TABLE site_config
    ADD COLUMN forever_landing_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
