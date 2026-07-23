DROP TABLE IF EXISTS ranking_snapshot_members;
DROP TABLE IF EXISTS ranking_snapshots;
ALTER TABLE site_config DROP COLUMN IF EXISTS parse_config;
ALTER TABLE tenants DROP COLUMN IF EXISTS parse_config;
