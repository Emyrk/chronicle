-- A unique, URL-safe author name for /addons/<author>/<slug>. Display names are not unique, so authors
-- claim one before publishing addons under it.
CREATE TABLE addon_authors (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL UNIQUE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT addon_authors_name_check CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(name) BETWEEN 2 AND 32)
);

-- People the owner shared an addon with. SpiceDB holds the matching relations and makes the decisions;
-- this table lists contributors and names them in usage breakdowns.
CREATE TABLE lua_project_contributors (
    project_id uuid NOT NULL REFERENCES lua_projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permissions text[] NOT NULL,
    added_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT lua_project_contributors_permissions_check CHECK (
        cardinality(permissions) > 0 AND permissions <@ ARRAY['edit', 'publish_unstable', 'publish']::text[])
);

CREATE INDEX lua_project_contributors_user_idx ON lua_project_contributors USING btree (user_id);
