CREATE TABLE dataset_class_buffs (
    dataset_id UUID PRIMARY KEY REFERENCES datasets(id) ON DELETE CASCADE,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
