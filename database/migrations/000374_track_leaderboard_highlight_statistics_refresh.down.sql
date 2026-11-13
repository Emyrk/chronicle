BEGIN;
ALTER TABLE leaderboard_highlights DROP COLUMN statistics_refreshed_at;
COMMIT;
