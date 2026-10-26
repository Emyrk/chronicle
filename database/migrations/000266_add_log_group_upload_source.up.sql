BEGIN;

-- The authenticated path a log group was uploaded through. NULL for groups
-- uploaded before this was recorded (no backfill).
CREATE TYPE upload_source AS ENUM (
    'web',      -- browser session (the Upload page)
    'sidekick', -- a Chronicle Sidekick installation's OAuth token
    'api'       -- any other OAuth bearer token or a server upload key
);

ALTER TABLE wow_log_groups
    ADD COLUMN upload_source upload_source,
    ADD COLUMN sidekick_installation_id UUID REFERENCES sidekick_installations(id) ON DELETE SET NULL;

CREATE INDEX idx_wow_log_groups_sidekick_installation_id
    ON wow_log_groups (sidekick_installation_id)
    WHERE sidekick_installation_id IS NOT NULL;

COMMIT;
