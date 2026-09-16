BEGIN;

DROP TRIGGER signal_ranking_run_sources_after_identity_update ON log_instances;
DROP TRIGGER signal_ranking_run_sources_after_delete ON log_instances;
DROP FUNCTION signal_ranking_run_sources_after_identity_update();
DROP FUNCTION signal_ranking_run_sources_after_delete();
DROP FUNCTION touch_ranking_run_repair_sources(UUID[]);

COMMIT;
