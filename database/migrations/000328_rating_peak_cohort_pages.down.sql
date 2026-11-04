BEGIN;
DROP INDEX rating_live_guild_peak_page_idx;
DROP INDEX rating_live_player_peak_page_idx;
DROP TABLE rating_peak_cohort_pages;
COMMIT;
