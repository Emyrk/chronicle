BEGIN;

ALTER TABLE sidekick_installations
  ADD COLUMN start_at_login BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN auto_upload_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT sidekick_installations_auto_upload_capabilities_object
    CHECK (jsonb_typeof(auto_upload_capabilities) = 'object');

-- Existing path-keyed rows remain until that installation's next heartbeat.
-- Sidekick is the only authority for opaque directory IDs.
ALTER TABLE sidekick_wow_directories
  ADD COLUMN id TEXT,
  ADD COLUMN game_format TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT sidekick_wow_directories_id_length
    CHECK (id IS NULL OR char_length(id) BETWEEN 1 AND 100);

CREATE UNIQUE INDEX sidekick_wow_directories_sidekick_id_id_idx
  ON sidekick_wow_directories (sidekick_id, id)
  WHERE id IS NOT NULL;

COMMIT;
