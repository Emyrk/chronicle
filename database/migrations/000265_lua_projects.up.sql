BEGIN;

-- New, empty tables only. No existing rows are rewritten during startup.
CREATE TABLE lua_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('panel', 'guide')),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    draft_hash TEXT,
    unstable_hash TEXT,
    stable_hash TEXT,
    unstable_published_at TIMESTAMPTZ,
    unstable_published_by UUID REFERENCES users(id),
    stable_published_at TIMESTAMPTZ,
    stable_published_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, slug)
);
CREATE INDEX lua_projects_public_idx ON lua_projects (stable_published_at DESC) WHERE stable_hash IS NOT NULL;
CREATE INDEX lua_projects_owner_idx ON lua_projects (owner_id, updated_at DESC);

CREATE TABLE lua_project_artifacts (
    project_id UUID NOT NULL REFERENCES lua_projects(id) ON DELETE CASCADE,
    hash TEXT NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
    bytes BYTEA NOT NULL,
    PRIMARY KEY (project_id, hash)
);

COMMIT;
