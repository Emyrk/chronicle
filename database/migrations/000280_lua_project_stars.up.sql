-- A star means the user tracks the addon: it is offered in their instance panel picker.
-- Owners always track their own addons; the API keeps them from unstarring.
CREATE TABLE lua_project_stars (
    project_id uuid NOT NULL REFERENCES lua_projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY (project_id, user_id)
);

CREATE INDEX lua_project_stars_user_idx ON lua_project_stars (user_id, created_at DESC);

-- One row per existing addon, so owners start out tracking theirs.
INSERT INTO lua_project_stars (project_id, user_id, created_at)
SELECT id, owner_id, created_at FROM lua_projects;
