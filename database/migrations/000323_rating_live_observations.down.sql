BEGIN;
DROP TABLE rating_dirty_peak_cohorts;
DROP TABLE rating_dirty_mastery_subjects;
DROP TABLE rating_live_guild_observations;
DROP TABLE rating_live_player_observations;
DROP FUNCTION mark_live_guild_rating_dirty();
DROP FUNCTION mark_live_player_rating_dirty();
COMMIT;
