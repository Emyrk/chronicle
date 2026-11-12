-- Support /sitemap.xml, which lists the most recently active characters and
-- raids: both lookups walk these indexes newest-first and stop at the cap
-- instead of sorting whole tables.
--
-- game_players and log_instances are large. If deploy-time locking matters,
-- build these with CREATE INDEX CONCURRENTLY first; IF NOT EXISTS then makes
-- this startup migration a no-op.
CREATE INDEX IF NOT EXISTS idx_game_players_updated_at
  ON game_players (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_instances_start_time
  ON log_instances (start_time DESC)
  WHERE start_time IS NOT NULL;
