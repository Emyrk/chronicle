BEGIN;

CREATE TABLE cache_generations (
    namespace TEXT NOT NULL,
    scope TEXT NOT NULL,
    scope_id UUID NOT NULL,
    generation BIGINT NOT NULL CHECK (generation > 0),
    PRIMARY KEY (namespace, scope, scope_id),
    CONSTRAINT cache_generations_scope_check CHECK (
        (scope = 'global' AND scope_id = '00000000-0000-0000-0000-000000000000'::uuid)
        OR (scope = 'dataset' AND scope_id <> '00000000-0000-0000-0000-000000000000'::uuid)
    )
);

COMMIT;
