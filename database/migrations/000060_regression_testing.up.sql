-- Add parser version tracking to log instances
ALTER TABLE log_instances ADD COLUMN parser_version TEXT NOT NULL DEFAULT '0.0';

-- Pinned regression fixtures (references existing log groups)
CREATE TABLE regression_fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE UNIQUE,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snapshots: one per fixture per snapshot run
CREATE TABLE regression_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id UUID NOT NULL REFERENCES regression_fixtures(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_regression_snapshots_fixture ON regression_snapshots(fixture_id, created_at DESC);
