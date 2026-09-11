BEGIN;

CREATE SEQUENCE ranking_run_summary_dirty_generation_seq AS BIGINT;

SELECT setval(
    'ranking_run_summary_dirty_generation_seq',
    COALESCE((SELECT MAX(generation) FROM ranking_run_summary_dirty), 0) + 1,
    false
);

ALTER TABLE ranking_run_summary_dirty
    ALTER COLUMN generation
    SET DEFAULT nextval('ranking_run_summary_dirty_generation_seq');

CREATE OR REPLACE FUNCTION mark_ranking_run_summary_dirty(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    current_transaction_id XID8 := pg_current_xact_id();
BEGIN
    IF p_run_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO ranking_run_summary_dirty (
        run_id, last_transaction_id, updated_at
    ) VALUES (
        p_run_id, current_transaction_id, now()
    )
    ON CONFLICT (run_id) DO UPDATE SET
        generation = EXCLUDED.generation,
        last_transaction_id = EXCLUDED.last_transaction_id,
        updated_at = EXCLUDED.updated_at
    WHERE ranking_run_summary_dirty.last_transaction_id
          IS DISTINCT FROM EXCLUDED.last_transaction_id;
END;
$$;

DROP TRIGGER trg_invalidate_ranking_run_from_instance_update ON log_instances;

CREATE TRIGGER trg_invalidate_ranking_run_from_instance_update
AFTER UPDATE OF duplicate_group_id, name, realm_id, start_time, difficulty_name, max_players ON log_instances
FOR EACH ROW
WHEN (
    OLD.duplicate_group_id IS DISTINCT FROM NEW.duplicate_group_id
    OR OLD.name IS DISTINCT FROM NEW.name
    OR OLD.realm_id IS DISTINCT FROM NEW.realm_id
    OR OLD.start_time IS DISTINCT FROM NEW.start_time
    OR OLD.difficulty_name IS DISTINCT FROM NEW.difficulty_name
    OR OLD.max_players IS DISTINCT FROM NEW.max_players
)
EXECUTE FUNCTION invalidate_ranking_run_from_instance_update();

COMMIT;
