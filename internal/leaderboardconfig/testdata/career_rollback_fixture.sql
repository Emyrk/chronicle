-- The older seed round-trip test deliberately rolls back 344 in isolation.
-- In a real rollback, migration 355 (and this whole table) has already gone.
DELETE FROM leaderboard_career_variants;
