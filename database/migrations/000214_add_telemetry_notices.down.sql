BEGIN;

DROP TABLE IF EXISTS telemetry_notices;

ALTER TABLE deployment_info
    DROP COLUMN IF EXISTS deployment_token;

COMMIT;
