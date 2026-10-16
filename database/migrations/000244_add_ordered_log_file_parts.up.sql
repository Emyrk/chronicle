BEGIN;

CREATE TABLE log_file_parts (
    id uuid PRIMARY KEY,
    log_file_id uuid NOT NULL REFERENCES log_file(id) ON DELETE CASCADE,
    sequence bigint NOT NULL CHECK (sequence > 0),
    upload_id uuid NOT NULL,
    reservation_id uuid NOT NULL,
    source_sequence bigint,
    object_key text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
    hash text,
    size_bytes bigint,
    compressed_size_bytes bigint,
    content_encoding text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finalized_at timestamptz,

    UNIQUE (log_file_id, sequence),
    UNIQUE (log_file_id, upload_id),
    UNIQUE (object_key)
);

CREATE UNIQUE INDEX log_file_parts_source_sequence_idx
    ON log_file_parts(log_file_id, source_sequence)
    WHERE source_sequence IS NOT NULL;

CREATE INDEX log_file_parts_pending_idx
    ON log_file_parts(log_file_id, created_at)
    WHERE status = 'pending';

COMMIT;
