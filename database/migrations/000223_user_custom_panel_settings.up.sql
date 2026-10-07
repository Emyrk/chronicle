BEGIN;

CREATE TABLE custom_panel_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    manifest JSONB NOT NULL,
    manifest_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT custom_panel_releases_repository_format CHECK (repository = lower(repository) AND repository ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$'),
    CONSTRAINT custom_panel_releases_commit_sha_format CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
    CONSTRAINT custom_panel_releases_manifest_object CHECK (jsonb_typeof(manifest) = 'object'),
    CONSTRAINT custom_panel_releases_manifest_size CHECK (octet_length(manifest::text) <= 65536),
    CONSTRAINT custom_panel_releases_manifest_sha256_format CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT custom_panel_releases_repository_commit_unique UNIQUE (repository, commit_sha)
);

CREATE TABLE user_custom_panel_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_custom_panel_installations (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    release_id UUID NOT NULL REFERENCES custom_panel_releases(id) ON DELETE RESTRICT,
    installed_ref TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, repository),
    CONSTRAINT user_custom_panel_installations_repository_format CHECK (repository = lower(repository) AND repository ~ '^[a-z0-9_.-]+/[a-z0-9_.-]+$')
);

CREATE INDEX user_custom_panel_installations_release_id_idx
    ON user_custom_panel_installations (release_id);

COMMIT;
