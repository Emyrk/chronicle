-- Talent tree data stored as a pre-computed JSONB document per dataset.
-- The JSON shape matches the frontend's TalentTreeJSON type:
--   { "classes": { "<classID>": { "tabs": [...] } } }
-- Always consumed as a whole blob, never queried per-talent.
CREATE TABLE dataset_talent_trees (
    dataset_id UUID PRIMARY KEY REFERENCES datasets(id) ON DELETE CASCADE,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
