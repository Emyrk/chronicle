BEGIN;

ALTER TABLE log_file ADD COLUMN storage_deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN log_file.storage_deleted_at IS 'The timestamp when the file was deleted from storage. This allows us to keep track of files that have been removed from storage, even if the log_file record still exists in the database.';

CREATE TABLE data_limit (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_storage_bytes BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO data_limit (user_id, updated_at, max_storage_bytes)
SELECT id, NOW(), 500000000 -- 500mb default limit
FROM users;

END;