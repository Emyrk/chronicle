BEGIN;

-- The old schema has one deployment-global row per name, so tenant-specific
-- rows cannot be represented during rollback.
DELETE FROM class_buff_ignores WHERE tenant_id IS NOT NULL;

DROP INDEX IF EXISTS class_buff_ignores_tenant_id_idx;
ALTER TABLE class_buff_ignores
    DROP CONSTRAINT class_buff_ignores_pkey,
    DROP CONSTRAINT class_buff_ignores_scope_check,
    DROP COLUMN tenant_id,
    DROP COLUMN scope_id,
    ADD PRIMARY KEY (normalized_name);

COMMIT;
