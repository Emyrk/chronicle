-- Authenticate deployment telemetry and support centrally managed notices.
-- Rebuild deployment_latest so an unseen deployment can reserve its token hash
-- before its first telemetry report is stored.
PRAGMA foreign_keys = OFF;

CREATE TABLE deployment_latest_new (
    deployment_id    TEXT PRIMARY KEY,
    last_report_id   INTEGER REFERENCES telemetry_reports(id),
    last_reported_at TEXT NOT NULL DEFAULT '',
    version          TEXT NOT NULL DEFAULT '',
    server_type      TEXT NOT NULL DEFAULT '',
    access_url       TEXT NOT NULL DEFAULT '',
    is_dev           INTEGER NOT NULL DEFAULT 0,
    token_hash       TEXT NOT NULL DEFAULT ''
);

INSERT INTO deployment_latest_new
    (deployment_id, last_report_id, last_reported_at, version, server_type, access_url, is_dev, token_hash)
SELECT deployment_id, last_report_id, last_reported_at, version, server_type, access_url, is_dev, ''
FROM deployment_latest;

DROP TABLE deployment_latest;
ALTER TABLE deployment_latest_new RENAME TO deployment_latest;

CREATE TABLE notices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id   TEXT,
    audience        TEXT NOT NULL CHECK (audience IN ('public', 'admin')),
    category        TEXT NOT NULL CHECK (category IN ('compliance', 'release', 'maintenance', 'announcement')),
    severity        TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    action_label    TEXT,
    action_url      TEXT,
    enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    starts_at       TEXT,
    expires_at      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notices_active_target
ON notices(enabled, deployment_id, starts_at, expires_at);

PRAGMA foreign_keys = ON;
