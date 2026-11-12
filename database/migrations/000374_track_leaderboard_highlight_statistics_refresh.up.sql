BEGIN;
-- Nullable metadata only: existing snapshots recalculate statistics on their next refresh.
ALTER TABLE leaderboard_highlights ADD COLUMN statistics_refreshed_at timestamptz;
COMMIT;
