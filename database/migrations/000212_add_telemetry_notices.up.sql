BEGIN;

ALTER TABLE deployment_info
    ADD COLUMN deployment_token TEXT;

CREATE TABLE telemetry_notices (
    id TEXT PRIMARY KEY,
    audience TEXT NOT NULL CHECK (audience IN ('public', 'admin')),
    category TEXT NOT NULL CHECK (category IN ('compliance', 'release', 'maintenance', 'announcement')),
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_label TEXT,
    action_url TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX telemetry_notices_audience_idx ON telemetry_notices (audience);

COMMIT;
