BEGIN;

-- Destructive membership changes must leave a watermark on a surviving member
-- so incremental repair can detect stale ranking_runs rows. Each affected
-- logical run causes at most one extra log_instances update. The trigger does
-- not aggregate representatives or scan historical rows.
CREATE FUNCTION touch_ranking_run_repair_sources(affected_run_ids UUID[])
RETURNS void
LANGUAGE sql
AS $$
    WITH affected_runs AS MATERIALIZED (
        SELECT DISTINCT affected.run_id
        FROM unnest(affected_run_ids) AS affected(run_id)
        WHERE affected.run_id IS NOT NULL
    ),
    surviving_members AS MATERIALIZED (
        SELECT DISTINCT ON (affected.run_id)
            affected.run_id,
            member.id
        FROM affected_runs affected
        JOIN log_instances member
          ON member.duplicate_group_id = affected.run_id
          OR (member.id = affected.run_id AND member.duplicate_group_id IS NULL)
        ORDER BY affected.run_id, member.updated_at DESC, member.id
    ),
    repair_watermarks AS (
        SELECT
            surviving.id,
            GREATEST(
                clock_timestamp(),
                MAX(member.updated_at),
                ranking_runs.source_updated_at
            ) + INTERVAL '1 microsecond' AS updated_at
        FROM surviving_members surviving
        JOIN log_instances member
          ON member.duplicate_group_id = surviving.run_id
          OR (member.id = surviving.run_id AND member.duplicate_group_id IS NULL)
        LEFT JOIN ranking_runs ON ranking_runs.run_id = surviving.run_id
        GROUP BY surviving.run_id, surviving.id, ranking_runs.source_updated_at
    )
    UPDATE log_instances target
    SET updated_at = repair.updated_at
    FROM repair_watermarks repair
    WHERE target.id = repair.id;
$$;

CREATE FUNCTION signal_ranking_run_sources_after_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    affected_run_ids UUID[];
BEGIN
    SELECT array_agg(DISTINCT COALESCE(deleted.duplicate_group_id, deleted.id))
    INTO affected_run_ids
    FROM deleted_log_instances deleted;

    PERFORM touch_ranking_run_repair_sources(affected_run_ids);
    RETURN NULL;
END;
$$;

CREATE FUNCTION signal_ranking_run_sources_after_identity_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    affected_run_ids UUID[];
BEGIN
    -- The helper updates only updated_at on log_instances, which invokes this
    -- unqualified statement trigger recursively. Skip that inner invocation.
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    SELECT array_agg(affected.run_id)
    INTO affected_run_ids
    FROM (
        SELECT COALESCE(old_rows.duplicate_group_id, old_rows.id) AS run_id
        FROM old_log_instances old_rows
        JOIN new_log_instances new_rows USING (id)
        WHERE old_rows.duplicate_group_id IS DISTINCT FROM new_rows.duplicate_group_id
        UNION
        SELECT COALESCE(new_rows.duplicate_group_id, new_rows.id) AS run_id
        FROM old_log_instances old_rows
        JOIN new_log_instances new_rows USING (id)
        WHERE old_rows.duplicate_group_id IS DISTINCT FROM new_rows.duplicate_group_id
    ) affected;

    PERFORM touch_ranking_run_repair_sources(affected_run_ids);
    RETURN NULL;
END;
$$;

CREATE TRIGGER signal_ranking_run_sources_after_delete
AFTER DELETE ON log_instances
REFERENCING OLD TABLE AS deleted_log_instances
FOR EACH STATEMENT
EXECUTE FUNCTION signal_ranking_run_sources_after_delete();

-- Transition tables require an unqualified UPDATE trigger. The trigger function
-- filters statements that did not change duplicate_group_id and writes nothing.
CREATE TRIGGER signal_ranking_run_sources_after_identity_update
AFTER UPDATE ON log_instances
REFERENCING OLD TABLE AS old_log_instances NEW TABLE AS new_log_instances
FOR EACH STATEMENT
EXECUTE FUNCTION signal_ranking_run_sources_after_identity_update();

COMMIT;
