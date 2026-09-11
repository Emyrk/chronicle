-- name: RecordGuildResourceView :exec
WITH new_unique AS (
    INSERT INTO guild_resource_recent_visitors (
        guild_id,
        resource_kind,
        resource_key,
        visitor_id,
        viewed_on
    )
    VALUES (
        @guild_id,
        @resource_kind,
        @resource_key,
        @visitor_id,
        (now() AT TIME ZONE 'UTC')::date
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
)
INSERT INTO guild_resource_daily_stats (
    guild_id,
    resource_kind,
    resource_key,
    viewed_on,
    views,
    unique_visitors
)
VALUES (
    @guild_id,
    @resource_kind,
    @resource_key,
    (now() AT TIME ZONE 'UTC')::date,
    1,
    (SELECT COUNT(*) FROM new_unique)
)
ON CONFLICT (guild_id, resource_kind, resource_key, viewed_on)
DO UPDATE SET
    views = guild_resource_daily_stats.views + 1,
    unique_visitors = guild_resource_daily_stats.unique_visitors + EXCLUDED.unique_visitors;

-- name: GuildResourceAnalytics :many
SELECT
    stats.resource_kind,
    stats.resource_key,
    stats.viewed_on,
    stats.views,
    stats.unique_visitors,
    (CASE
        WHEN stats.resource_kind = 'guild_page' THEN g.name
        WHEN stats.resource_kind = 'instance' THEN COALESCE(instance.name, stats.resource_key)
        ELSE stats.resource_key
    END)::text AS resource_name
FROM guild_resource_daily_stats AS stats
JOIN guilds AS g ON g.id = stats.guild_id
LEFT JOIN log_instances AS instance
    ON stats.resource_kind = 'instance'
    AND instance.hashed_slug = stats.resource_key
WHERE stats.guild_id = @guild_id
  AND stats.viewed_on > (now() AT TIME ZONE 'UTC')::date - @lookback_days::int
ORDER BY stats.viewed_on ASC, stats.resource_kind ASC, resource_name ASC;

-- name: DeleteExpiredGuildResourceVisitors :exec
DELETE FROM guild_resource_recent_visitors
WHERE viewed_on < (now() AT TIME ZONE 'UTC')::date - 1;
