BEGIN;
-- Operational audit metadata only; existing operations remain unbounded below.
ALTER TABLE leaderboard_operations ADD COLUMN after_date date;
COMMIT;
