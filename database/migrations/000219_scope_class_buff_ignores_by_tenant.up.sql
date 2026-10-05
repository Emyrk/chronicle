BEGIN;

ALTER TABLE class_buff_ignores
    ADD COLUMN scope_id UUID,
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Existing deployment-global ignores become root-scope ignores.
UPDATE class_buff_ignores
SET scope_id = '00000000-0000-0000-0000-000000000000'::UUID;

ALTER TABLE class_buff_ignores
    ALTER COLUMN scope_id SET NOT NULL,
    DROP CONSTRAINT class_buff_ignores_pkey,
    ADD CONSTRAINT class_buff_ignores_scope_check CHECK (
        scope_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ),
    ADD PRIMARY KEY (scope_id, normalized_name);

CREATE INDEX class_buff_ignores_tenant_id_idx ON class_buff_ignores (tenant_id);

COMMIT;
