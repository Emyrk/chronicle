-- Addons have one main (the latest saved source, still stored as draft_hash) and author-tagged releases.
-- Only the newest three releases keep their files; older ones stay listed with hash set to NULL.
CREATE TABLE lua_project_releases (
    project_id uuid NOT NULL REFERENCES lua_projects(id) ON DELETE CASCADE,
    tag text NOT NULL,
    hash text,
    icon text,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    published_by uuid REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (project_id, tag),
    CONSTRAINT lua_project_releases_tag_check CHECK (tag ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
    CONSTRAINT lua_project_releases_hash_check CHECK (hash IS NULL OR hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX lua_project_releases_recent_idx ON lua_project_releases USING btree (project_id, published_at DESC);

-- The stable build becomes each addon's first release. Unstable builds go away: main replaces them.
INSERT INTO lua_project_releases (project_id, tag, hash, icon, published_at, published_by)
SELECT id, 'v1', stable_hash, stable_icon, COALESCE(stable_published_at, now()), stable_published_by
FROM lua_projects WHERE stable_hash IS NOT NULL;

DROP INDEX lua_projects_public_idx;
ALTER TABLE lua_projects
    DROP COLUMN unstable_hash, DROP COLUMN unstable_icon, DROP COLUMN unstable_published_at, DROP COLUMN unstable_published_by,
    DROP COLUMN stable_hash, DROP COLUMN stable_icon, DROP COLUMN stable_published_at, DROP COLUMN stable_published_by;

-- Contributor grants become edit and release; either publish grant may release.
ALTER TABLE lua_project_contributors DROP CONSTRAINT lua_project_contributors_permissions_check;
UPDATE lua_project_contributors SET permissions = ARRAY(
    SELECT DISTINCT CASE WHEN p IN ('publish', 'publish_unstable') THEN 'release' ELSE p END FROM unnest(permissions) AS p ORDER BY 1);
ALTER TABLE lua_project_contributors ADD CONSTRAINT lua_project_contributors_permissions_check CHECK (
    cardinality(permissions) > 0 AND permissions <@ ARRAY['edit', 'release']::text[]);
