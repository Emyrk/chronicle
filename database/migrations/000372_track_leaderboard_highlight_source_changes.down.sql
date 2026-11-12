BEGIN;
ALTER TABLE leaderboard_highlights DROP COLUMN source_generation;
DROP TABLE leaderboard_highlight_sources;
COMMIT;
