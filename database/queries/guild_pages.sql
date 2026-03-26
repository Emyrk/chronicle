-- Guild Pages

-- name: GetGuildPage :one
SELECT * FROM guild_pages WHERE guild_id = $1;

-- name: GetGuildPageByID :one
SELECT * FROM guild_pages WHERE id = $1;

-- name: UpsertGuildPage :one
INSERT INTO guild_pages (guild_id, theme)
VALUES ($1, $2)
ON CONFLICT (guild_id) DO UPDATE SET
    theme = EXCLUDED.theme,
    updated_at = NOW()
RETURNING *;

-- name: DeleteGuildPage :exec
DELETE FROM guild_pages WHERE guild_id = $1;

-- Guild Page Tabs

-- name: ListGuildPageTabs :many
SELECT * FROM guild_page_tabs
WHERE page_id = $1
ORDER BY sort_order, created_at;

-- name: GetGuildPageTab :one
SELECT * FROM guild_page_tabs WHERE id = $1;

-- name: InsertGuildPageTab :one
INSERT INTO guild_page_tabs (page_id, label, slug, sort_order)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateGuildPageTab :one
UPDATE guild_page_tabs
SET label = $2, slug = $3, sort_order = $4
WHERE id = $1
RETURNING *;

-- name: DeleteGuildPageTab :exec
DELETE FROM guild_page_tabs WHERE id = $1;

-- name: DeleteGuildPageTabsByPage :exec
DELETE FROM guild_page_tabs WHERE page_id = $1;

-- Guild Page Panels

-- name: ListGuildPagePanels :many
SELECT * FROM guild_page_panels
WHERE tab_id = $1
ORDER BY (position->>'y')::int, (position->>'x')::int;

-- name: GetGuildPagePanel :one
SELECT * FROM guild_page_panels WHERE id = $1;

-- name: InsertGuildPagePanel :one
INSERT INTO guild_page_panels (tab_id, panel_type, config, position)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateGuildPagePanel :one
UPDATE guild_page_panels
SET panel_type = $2, config = $3, position = $4, updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: DeleteGuildPagePanel :exec
DELETE FROM guild_page_panels WHERE id = $1;

-- name: DeleteGuildPagePanelsByTab :exec
DELETE FROM guild_page_panels WHERE tab_id = $1;

-- name: BulkUpsertGuildPagePanels :exec
INSERT INTO guild_page_panels (id, tab_id, panel_type, config, position)
SELECT 
    COALESCE(d.id, gen_random_uuid()),
    d.tab_id,
    d.panel_type,
    d.config,
    d.position
FROM json_populate_recordset(null::guild_page_panels, $1::json) AS d
ON CONFLICT (id) DO UPDATE SET
    panel_type = EXCLUDED.panel_type,
    config = EXCLUDED.config,
    position = EXCLUDED.position,
    updated_at = NOW();

-- Full page fetch with all tabs and panels

-- name: GetFullGuildPage :one
SELECT 
    gp.*,
    g.name as guild_name,
    g.realm_id,
    r.name as realm_name
FROM guild_pages gp
JOIN guilds g ON g.id = gp.guild_id
JOIN wow_server_realms r ON r.id = g.realm_id
WHERE gp.guild_id = $1;

-- name: ListGuildsWithPages :many
SELECT 
    g.*,
    gp.id as page_id,
    r.name as realm_name
FROM guilds g
LEFT JOIN guild_pages gp ON gp.guild_id = g.id
JOIN wow_server_realms r ON r.id = g.realm_id
WHERE ($1::text = '' OR g.name ILIKE '%' || $1 || '%')
ORDER BY g.name
LIMIT $2 OFFSET $3;

-- name: GetGuildByID :one
SELECT g.*, r.name as realm_name
FROM guilds g
JOIN wow_server_realms r ON r.id = g.realm_id
WHERE g.id = $1;
