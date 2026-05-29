CREATE TABLE datasets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE NOT NULL,
    wow_version   TEXT NOT NULL,
    build_version INT  NOT NULL DEFAULT 5875,
    description   TEXT NOT NULL DEFAULT '',
    spell_dbc_storage_key TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE datasets ADD CONSTRAINT datasets_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$');

ALTER TABLE tenants ADD COLUMN default_dataset_id UUID REFERENCES datasets(id);
ALTER TABLE wow_servers ADD COLUMN default_dataset_id UUID REFERENCES datasets(id);
