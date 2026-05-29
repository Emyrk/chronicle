ALTER TABLE wow_servers DROP COLUMN IF EXISTS default_dataset_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS default_dataset_id;
DROP TABLE IF EXISTS datasets;
