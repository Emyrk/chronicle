BEGIN;

-- Run-scoped repair cannot use the player/character-leading unique index.
-- These index builds scan existing facts and may delay startup if populated.
CREATE INDEX renown_kill_facts_run_idx ON renown_kill_facts (run_id);
CREATE INDEX guild_renown_kill_facts_run_idx ON guild_renown_kill_facts (run_id);

COMMIT;
