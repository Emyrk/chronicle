BEGIN;

-- Metadata only: these new tables start empty. No historical logs are scanned.
CREATE TABLE log_identity_catalogues (
  log_group_id uuid PRIMARY KEY REFERENCES wow_log_groups(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation > 0),
  dataset_id uuid NOT NULL,
  dataset_revision bigint NOT NULL CHECK (dataset_revision >= 0),
  format text NOT NULL,
  flavor text NOT NULL,
  parser_engine text NOT NULL,
  parser_build text NOT NULL,
  catalogue_version integer NOT NULL CHECK (catalogue_version > 0),
  rule_version integer NOT NULL CHECK (rule_version > 0),
  first_seen timestamptz,
  last_seen timestamptz,
  guid_count bigint NOT NULL CHECK (guid_count >= 0),
  event_count bigint NOT NULL CHECK (event_count >= 0),
  zero_guid_count bigint NOT NULL CHECK (zero_guid_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE log_identity_catalogue_records (
  log_group_id uuid NOT NULL REFERENCES log_identity_catalogues(log_group_id) ON DELETE CASCADE,
  guid wow_guid NOT NULL,
  classification text NOT NULL,
  is_unknown boolean NOT NULL,
  has_conflicts boolean NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (log_group_id, guid)
);
CREATE INDEX log_identity_catalogue_records_unknown_idx ON log_identity_catalogue_records (log_group_id, guid) WHERE is_unknown;
CREATE INDEX log_identity_catalogue_records_conflicts_idx ON log_identity_catalogue_records (log_group_id, guid) WHERE has_conflicts;

COMMIT;
