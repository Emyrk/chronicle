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

-- name: InstanceAnalyticsGroupKey :one
SELECT COALESCE(group_instance.hashed_slug, instance.hashed_slug)::text AS group_key
FROM log_instances AS instance
LEFT JOIN log_instances AS group_instance
    ON group_instance.id = instance.duplicate_group_id
WHERE instance.id = @instance_id
  AND instance.hashed_slug IS NOT NULL;

-- name: RecordGuildInstanceView :exec
WITH resources AS (
    SELECT 'instance'::text AS resource_kind, @group_key::text AS resource_key
    UNION ALL
    SELECT 'instance_member'::text, @member_key::text
),
new_unique AS (
    INSERT INTO guild_resource_recent_visitors (
        guild_id,
        resource_kind,
        resource_key,
        visitor_id,
        viewed_on
    )
    SELECT
        @guild_id,
        resources.resource_kind,
        resources.resource_key,
        @visitor_id,
        (now() AT TIME ZONE 'UTC')::date
    FROM resources
    ON CONFLICT DO NOTHING
    RETURNING resource_kind, resource_key
)
INSERT INTO guild_resource_daily_stats (
    guild_id,
    resource_kind,
    resource_key,
    viewed_on,
    views,
    unique_visitors
)
SELECT
    @guild_id,
    resources.resource_kind,
    resources.resource_key,
    (now() AT TIME ZONE 'UTC')::date,
    1,
    CASE WHEN new_unique.resource_key IS NULL THEN 0 ELSE 1 END
FROM resources
LEFT JOIN new_unique USING (resource_kind, resource_key)
ON CONFLICT (guild_id, resource_kind, resource_key, viewed_on)
DO UPDATE SET
    views = guild_resource_daily_stats.views + 1,
    unique_visitors = guild_resource_daily_stats.unique_visitors + EXCLUDED.unique_visitors;

-- name: GuildResourceAnalytics :many
SELECT
    stats.resource_kind,
    stats.resource_key,
    (CASE
        WHEN stats.resource_kind IN ('instance', 'instance_member') THEN COALESCE(group_instance.hashed_slug, instance.hashed_slug, stats.resource_key)
        ELSE stats.resource_key
    END)::text AS resource_group_key,
    stats.viewed_on,
    stats.views,
    stats.unique_visitors,
    (CASE
        WHEN stats.resource_kind = 'guild_page' THEN g.name
        WHEN stats.resource_kind IN ('instance', 'instance_member') THEN COALESCE(instance.name, stats.resource_key)
        ELSE stats.resource_key
    END)::text AS resource_name
FROM guild_resource_daily_stats AS stats
JOIN guilds AS g ON g.id = stats.guild_id
LEFT JOIN log_instances AS instance
    ON stats.resource_kind IN ('instance', 'instance_member')
    AND instance.hashed_slug = stats.resource_key
LEFT JOIN log_instances AS group_instance
    ON group_instance.id = instance.duplicate_group_id
WHERE stats.guild_id = @guild_id
  AND stats.viewed_on > (now() AT TIME ZONE 'UTC')::date - @lookback_days::int
ORDER BY stats.viewed_on ASC, stats.resource_kind ASC, resource_name ASC;

-- name: DeleteExpiredGuildResourceVisitors :exec
DELETE FROM guild_resource_recent_visitors
WHERE viewed_on < (now() AT TIME ZONE 'UTC')::date - 1;
