BEGIN;

DROP TRIGGER IF EXISTS trg_invalidate_ranking_runs_from_server_tenant_update ON wow_servers;
DROP TRIGGER IF EXISTS trg_invalidate_ranking_run_before_instance_delete ON log_instances;
DROP TRIGGER IF EXISTS trg_invalidate_ranking_run_from_instance_update ON log_instances;
DROP TRIGGER IF EXISTS trg_invalidate_ranking_run_from_ranking_mutation ON encounter_dps_rankings;

DROP FUNCTION IF EXISTS invalidate_ranking_runs_from_server_tenant_update();
DROP FUNCTION IF EXISTS invalidate_ranking_run_before_instance_delete();
DROP FUNCTION IF EXISTS invalidate_ranking_run_from_instance_update();
DROP FUNCTION IF EXISTS invalidate_ranking_run_from_ranking_mutation();
DROP FUNCTION IF EXISTS mark_instance_ranking_run_summary_dirty(UUID);
DROP FUNCTION IF EXISTS mark_ranking_run_summary_dirty(UUID);

DROP TABLE IF EXISTS ranking_run_summary_dirty;
DROP TABLE IF EXISTS ranking_player_run_summaries;
DROP TABLE IF EXISTS ranking_runs;

COMMIT;
