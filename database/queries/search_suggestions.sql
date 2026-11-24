-- name: SuggestPlayers :many
-- Per-realm index walks bound candidates before the cross-realm merge.
-- C ordering puts an exact folded name before every longer prefix match.
WITH term AS (
    SELECT lower(@query::text) COLLATE "C" AS value
), bounds AS (
    SELECT value, CASE WHEN rtrim(value, chr(1114111)) <> '' THEN
        left(rtrim(value, chr(1114111)), -1) ||
        chr(CASE ascii(right(rtrim(value, chr(1114111)), 1))
            WHEN 55295 THEN 57344 ELSE ascii(right(rtrim(value, chr(1114111)), 1)) + 1 END)
    END AS upper_bound FROM term
)
SELECT e.id, e.name, e.class, r.id AS realm_id, r.name AS realm_name
FROM bounds b CROSS JOIN wow_server_realms r
JOIN wow_servers s ON s.id = r.server_id
CROSS JOIN LATERAL (
    -- Separate finite/unbounded ranges so generic prepared plans can use
    -- both index range keys; the unbounded branch only handles all-max runes.
    SELECT candidates.* FROM (
        (SELECT e.id, e.name, e.class FROM game_players e
        WHERE e.realm_id = r.id AND b.upper_bound IS NOT NULL
          AND lower(e.name) COLLATE "C" < b.upper_bound COLLATE "C"
          AND lower(e.name) COLLATE "C" >= b.value
          AND lower(e.name) COLLATE "C" LIKE lower(@prefix::text) COLLATE "C" ESCAPE '\'
        ORDER BY lower(e.name) COLLATE "C", e.id LIMIT 5)
        UNION ALL
        (SELECT e.id, e.name, e.class FROM game_players e
        WHERE e.realm_id = r.id AND b.upper_bound IS NULL
          AND lower(e.name) COLLATE "C" >= b.value
          AND lower(e.name) COLLATE "C" LIKE lower(@prefix::text) COLLATE "C" ESCAPE '\'
        ORDER BY lower(e.name) COLLATE "C", e.id LIMIT 5)
    ) candidates
    ORDER BY lower(candidates.name) COLLATE "C", candidates.id LIMIT 5
) e
WHERE (s.tenant_id = @tenant_id::uuid OR
       (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND
        (s.tenant_id IS NULL OR s.tenant_id IN (SELECT id FROM tenants WHERE include_in_all))))
ORDER BY lower(e.name) COLLATE "C", r.id, e.id
LIMIT 5;

-- name: SuggestGuilds :many
-- Per-realm index walks bound candidates before the cross-realm merge.
-- C ordering puts an exact folded name before every longer prefix match.
WITH term AS (
    SELECT lower(@query::text) COLLATE "C" AS value
), bounds AS (
    SELECT value, CASE WHEN rtrim(value, chr(1114111)) <> '' THEN
        left(rtrim(value, chr(1114111)), -1) ||
        chr(CASE ascii(right(rtrim(value, chr(1114111)), 1))
            WHEN 55295 THEN 57344 ELSE ascii(right(rtrim(value, chr(1114111)), 1)) + 1 END)
    END AS upper_bound FROM term
)
SELECT e.id, e.name, r.id AS realm_id, r.name AS realm_name
FROM bounds b CROSS JOIN wow_server_realms r
JOIN wow_servers s ON s.id = r.server_id
CROSS JOIN LATERAL (
    -- Separate finite/unbounded ranges so generic prepared plans can use
    -- both index range keys; the unbounded branch only handles all-max runes.
    SELECT candidates.* FROM (
        (SELECT e.id, e.name FROM guilds e
        WHERE e.realm_id = r.id AND b.upper_bound IS NOT NULL
          AND lower(e.name) COLLATE "C" < b.upper_bound COLLATE "C"
          AND lower(e.name) COLLATE "C" >= b.value
          AND lower(e.name) COLLATE "C" LIKE lower(@prefix::text) COLLATE "C" ESCAPE '\'
        ORDER BY lower(e.name) COLLATE "C", e.id LIMIT 5)
        UNION ALL
        (SELECT e.id, e.name FROM guilds e
        WHERE e.realm_id = r.id AND b.upper_bound IS NULL
          AND lower(e.name) COLLATE "C" >= b.value
          AND lower(e.name) COLLATE "C" LIKE lower(@prefix::text) COLLATE "C" ESCAPE '\'
        ORDER BY lower(e.name) COLLATE "C", e.id LIMIT 5)
    ) candidates
    ORDER BY lower(candidates.name) COLLATE "C", candidates.id LIMIT 5
) e
WHERE (s.tenant_id = @tenant_id::uuid OR
       (@tenant_id::uuid = '00000000-0000-0000-0000-000000000000'::uuid AND
        (s.tenant_id IS NULL OR s.tenant_id IN (SELECT id FROM tenants WHERE include_in_all))))
ORDER BY lower(e.name) COLLATE "C", r.id, e.id
LIMIT 5;

