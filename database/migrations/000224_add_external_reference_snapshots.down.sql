BEGIN;

ALTER TABLE external_reference_entities
    DROP CONSTRAINT external_reference_entities_current_snapshot_fkey;

DROP TABLE external_reference_snapshots;
DROP TABLE external_reference_contents;
DROP TABLE external_reference_entities;
DROP FUNCTION validate_external_reference_tenant_realm();

COMMIT;
