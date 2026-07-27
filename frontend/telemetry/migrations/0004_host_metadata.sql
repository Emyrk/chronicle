-- Host metadata to disambiguate deployments whose access_url is left at
-- the localhost default. remote_ip already exists on telemetry_reports;
-- the dashboard/API surface it via the deployment_latest.last_report_id join.
ALTER TABLE telemetry_reports ADD COLUMN hostname TEXT NOT NULL DEFAULT '';
ALTER TABLE telemetry_reports ADD COLUMN os TEXT NOT NULL DEFAULT '';
ALTER TABLE telemetry_reports ADD COLUMN arch TEXT NOT NULL DEFAULT '';
