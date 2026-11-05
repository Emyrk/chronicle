BEGIN;

CREATE TABLE infrastructure_cost_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('published')),
  storage_as_of TIMESTAMPTZ NOT NULL,
  provider TEXT NOT NULL,
  provider_payload JSONB NOT NULL,
  provider_payload_sha256 TEXT NOT NULL,
  total_cost_microdollars BIGINT NOT NULL CHECK (total_cost_microdollars >= 0),
  active_uploader_count BIGINT NOT NULL CHECK (active_uploader_count >= 0),
  storage_owner_count BIGINT NOT NULL CHECK (storage_owner_count >= 0),
  warning_count BIGINT NOT NULL CHECK (warning_count >= 0),
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_start < period_end),
  UNIQUE (period_start, period_end, revision)
);

CREATE INDEX infrastructure_cost_reports_period_idx
  ON infrastructure_cost_reports (period_start DESC, period_end DESC, revision DESC);

CREATE TABLE infrastructure_cost_report_users (
  report_id UUID NOT NULL REFERENCES infrastructure_cost_reports(id),
  -- Deliberately not a foreign key: account purges must not erase or block immutable reports.
  user_id UUID NOT NULL,
  username_snapshot TEXT NOT NULL,
  active_uploader BOOLEAN NOT NULL,
  uploaded_files BIGINT NOT NULL CHECK (uploaded_files >= 0),
  monthly_parsed_bytes BIGINT NOT NULL CHECK (monthly_parsed_bytes >= 0),
  current_parsed_bytes BIGINT NOT NULL CHECK (current_parsed_bytes >= 0),
  shared_cost_microdollars BIGINT NOT NULL CHECK (shared_cost_microdollars >= 0),
  activity_cost_microdollars BIGINT NOT NULL CHECK (activity_cost_microdollars >= 0),
  storage_cost_microdollars BIGINT NOT NULL CHECK (storage_cost_microdollars >= 0),
  total_cost_microdollars BIGINT NOT NULL CHECK (total_cost_microdollars >= 0),
  PRIMARY KEY (report_id, user_id)
);

CREATE INDEX infrastructure_cost_report_users_total_idx
  ON infrastructure_cost_report_users (report_id, total_cost_microdollars DESC, user_id);

CREATE FUNCTION reject_infrastructure_cost_report_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'infrastructure cost report revisions are immutable';
END;
$$;

CREATE TRIGGER infrastructure_cost_reports_immutable
  BEFORE UPDATE OR DELETE ON infrastructure_cost_reports
  FOR EACH ROW EXECUTE FUNCTION reject_infrastructure_cost_report_mutation();

CREATE TRIGGER infrastructure_cost_report_users_immutable
  BEFORE UPDATE OR DELETE ON infrastructure_cost_report_users
  FOR EACH ROW EXECUTE FUNCTION reject_infrastructure_cost_report_mutation();

COMMIT;
