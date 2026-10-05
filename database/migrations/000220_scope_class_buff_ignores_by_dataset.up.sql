BEGIN;

CREATE TABLE class_buff_ignores_by_dataset (
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    normalized_name TEXT NOT NULL,
    spell_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT class_buff_ignores_by_dataset_name_check CHECK (
        normalized_name = lower(btrim(spell_name)) AND normalized_name <> ''
    ),
    PRIMARY KEY (dataset_id, normalized_name)
);

-- The tenant-scoped implementation was live only briefly. Preserve each policy
-- on the tenant's default dataset (or the deployment default when unset), while
-- root policies remain attached to the deployment default dataset.
INSERT INTO class_buff_ignores_by_dataset (dataset_id, normalized_name, spell_name, updated_at)
SELECT DISTINCT ON (dataset_id, normalized_name)
    dataset_id,
    normalized_name,
    spell_name,
    updated_at
FROM (
    SELECT
        COALESCE(
            tenants.default_dataset_id,
            '00000000-0000-0000-0000-000000000001'::UUID
        ) AS dataset_id,
        class_buff_ignores.normalized_name,
        class_buff_ignores.spell_name,
        class_buff_ignores.updated_at
    FROM class_buff_ignores
    LEFT JOIN tenants ON tenants.id = class_buff_ignores.tenant_id
) migrated
ORDER BY dataset_id, normalized_name, updated_at DESC;

DROP TABLE class_buff_ignores;
ALTER TABLE class_buff_ignores_by_dataset RENAME TO class_buff_ignores;
ALTER TABLE class_buff_ignores
    RENAME CONSTRAINT class_buff_ignores_by_dataset_pkey TO class_buff_ignores_pkey;
ALTER TABLE class_buff_ignores
    RENAME CONSTRAINT class_buff_ignores_by_dataset_name_check TO class_buff_ignores_normalized_name_check;

COMMIT;
