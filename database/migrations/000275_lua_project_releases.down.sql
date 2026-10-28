ALTER TABLE lua_project_contributors DROP CONSTRAINT lua_project_contributors_permissions_check;
UPDATE lua_project_contributors SET permissions = ARRAY(
    SELECT DISTINCT CASE WHEN p = 'release' THEN 'publish' ELSE p END FROM unnest(permissions) AS p ORDER BY 1);
ALTER TABLE lua_project_contributors ADD CONSTRAINT lua_project_contributors_permissions_check CHECK (
    cardinality(permissions) > 0 AND permissions <@ ARRAY['edit', 'publish_unstable', 'publish']::text[]);

ALTER TABLE lua_projects
    ADD COLUMN unstable_hash text, ADD COLUMN unstable_icon text, ADD COLUMN unstable_published_at timestamp with time zone,
    ADD COLUMN unstable_published_by uuid REFERENCES users(id),
    ADD COLUMN stable_hash text, ADD COLUMN stable_icon text, ADD COLUMN stable_published_at timestamp with time zone,
    ADD COLUMN stable_published_by uuid REFERENCES users(id);
-- The newest release with files becomes stable again.
UPDATE lua_projects p SET stable_hash = r.hash, stable_icon = r.icon, stable_published_at = r.published_at, stable_published_by = r.published_by
FROM (SELECT DISTINCT ON (project_id) * FROM lua_project_releases WHERE hash IS NOT NULL ORDER BY project_id, published_at DESC) r
WHERE r.project_id = p.id;
CREATE INDEX lua_projects_public_idx ON lua_projects USING btree (stable_published_at DESC) WHERE (stable_hash IS NOT NULL);
DROP TABLE lua_project_releases;
