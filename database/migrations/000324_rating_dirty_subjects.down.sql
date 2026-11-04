BEGIN;
DROP TRIGGER mark_guild_renown_dirty ON guild_renown_kill_facts;
DROP TRIGGER mark_player_renown_dirty ON renown_kill_facts;
DROP FUNCTION mark_rating_renown_fact_dirty();
DROP TABLE rating_dirty_renown_subjects;
COMMIT;
