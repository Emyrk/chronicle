-- Supports instance search's player.parse predicate: for one instance and
-- player, find the latest stored score per boss for a metric. Key order
-- matches the lookup's DISTINCT ON (encounter_name) ORDER BY created_at DESC,
-- precise_score DESC, so it reads straight off the index without sorting.
--
-- parse_score_results is large (~3M rows on 2026-11-02). Build this index
-- with CREATE INDEX CONCURRENTLY before deploying (see the PR description for
-- the script); IF NOT EXISTS then makes this startup migration a no-op.
CREATE INDEX IF NOT EXISTS idx_psr_instance_player_latest
  ON parse_score_results (tenant_id, instance_id, player_guid, metric, encounter_name, created_at DESC, precise_score DESC)
  INCLUDE (display_score, status);
