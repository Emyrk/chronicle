BEGIN;

-- Supports the ON DELETE CASCADE from encounter_dps_rankings without scanning
-- ranking_snapshot_members once for every deleted ranking row.
CREATE INDEX IF NOT EXISTS idx_ranking_snapshot_members_ranking_id
    ON ranking_snapshot_members (ranking_id);

COMMIT;
