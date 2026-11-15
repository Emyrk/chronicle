BEGIN;

-- Empty metadata tables only. No historical scan or backfill.
CREATE TABLE parser_handoffs (
  log_group_id uuid PRIMARY KEY REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  native_enabled boolean NOT NULL DEFAULT true,
  head_iteration bigint NOT NULL DEFAULT 0 CHECK (head_iteration >= 0),
  head_attempt_id uuid,
  parse_lease_token uuid,
  parse_lease_expires_at timestamptz,
  published_iteration bigint NOT NULL DEFAULT 0 CHECK (published_iteration >= 0),
  -- High-water authority survives expiry and release. Never clear this iteration.
  publication_iteration bigint NOT NULL DEFAULT 0 CHECK (publication_iteration >= 0),
  publication_token uuid,
  publication_expires_at timestamptz,
  CHECK ((head_iteration = 0) = (head_attempt_id IS NULL)),
  CHECK ((parse_lease_token IS NULL) = (parse_lease_expires_at IS NULL)),
  CHECK ((publication_token IS NULL) = (publication_expires_at IS NULL)),
  CHECK (published_iteration <= publication_iteration),
  CHECK (publication_iteration <= head_iteration)
);

CREATE TABLE parser_checkpoint_attempts (
  attempt_id uuid PRIMARY KEY,
  log_group_id uuid NOT NULL REFERENCES parser_handoffs(log_group_id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation > 0),
  iteration bigint NOT NULL CHECK (iteration > 0),
  predecessor_attempt_id uuid,
  producing_binary text NOT NULL CHECK (producing_binary <> ''),
  dataset_identity jsonb NOT NULL CHECK (jsonb_typeof(dataset_identity) = 'object'),
  input_identity jsonb NOT NULL CHECK (jsonb_typeof(input_identity) = 'object'),
  parser_engine text NOT NULL CHECK (parser_engine <> ''),
  object_key text NOT NULL CHECK (object_key <> ''),
  object_digest text NOT NULL CHECK (object_digest <> ''),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (log_group_id, iteration),
  UNIQUE (log_group_id, attempt_id),
  UNIQUE (log_group_id, iteration, attempt_id),
  FOREIGN KEY (log_group_id, predecessor_attempt_id)
    REFERENCES parser_checkpoint_attempts(log_group_id, attempt_id),
  CHECK ((iteration = 1) = (predecessor_attempt_id IS NULL))
);

ALTER TABLE parser_handoffs ADD CONSTRAINT parser_handoffs_head_fk
  FOREIGN KEY (log_group_id, head_iteration, head_attempt_id)
  REFERENCES parser_checkpoint_attempts(log_group_id, iteration, attempt_id);

COMMIT;
