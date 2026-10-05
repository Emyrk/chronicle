BEGIN;

CREATE TABLE class_buff_ignores_by_scope (
    normalized_name TEXT NOT NULL,
    spell_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scope_id UUID NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT class_buff_ignores_by_scope_name_check CHECK (
        normalized_name = lower(btrim(spell_name)) AND normalized_name <> ''
    ),
    CONSTRAINT class_buff_ignores_by_scope_scope_check CHECK (
        scope_id = COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ),
    PRIMARY KEY (scope_id, normalized_name)
);

-- Dataset policies cannot be mapped losslessly back to tenants. Preserve only
-- deployment-default policies as root-scope policies during rollback.
INSERT INTO class_buff_ignores_by_scope (
    normalized_name,
    spell_name,
    updated_at,
    scope_id,
    tenant_id
)
SELECT
    normalized_name,
    spell_name,
    updated_at,
    '00000000-0000-0000-0000-000000000000'::UUID,
    NULL
FROM class_buff_ignores
WHERE dataset_id = '00000000-0000-0000-0000-000000000001'::UUID;

DROP TABLE class_buff_ignores;
ALTER TABLE class_buff_ignores_by_scope RENAME TO class_buff_ignores;
ALTER TABLE class_buff_ignores
    RENAME CONSTRAINT class_buff_ignores_by_scope_pkey TO class_buff_ignores_pkey;
ALTER TABLE class_buff_ignores
    RENAME CONSTRAINT class_buff_ignores_by_scope_name_check TO class_buff_ignores_normalized_name_check;
ALTER TABLE class_buff_ignores
    RENAME CONSTRAINT class_buff_ignores_by_scope_scope_check TO class_buff_ignores_scope_check;
CREATE INDEX class_buff_ignores_tenant_id_idx ON class_buff_ignores (tenant_id);

COMMIT;
