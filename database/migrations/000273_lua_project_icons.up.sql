-- Each channel's project.json "icon", copied along with its hash so project lists can draw it without
-- downloading packages. NULL means the release named no icon.
ALTER TABLE lua_projects
    ADD COLUMN draft_icon text,
    ADD COLUMN unstable_icon text,
    ADD COLUMN stable_icon text;
