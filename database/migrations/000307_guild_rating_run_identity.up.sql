BEGIN;

-- One canonical boss kill can be credited to one guild, even if a later
-- duplicate upload has a different guild attribution. Existing earned credit
-- is retained; a representative change never mints a second guild award.
CREATE UNIQUE INDEX guild_renown_one_guild_per_run_idx
    ON guild_renown_kill_facts (realm_id, run_id, encounter_name);

-- Supports tenant-wide chronological paging before joining current realm
-- group membership; the ledger is empty on initial migration.
CREATE INDEX guild_renown_tenant_time_idx
    ON guild_renown_kill_facts (tenant_id, killed_at, id);

COMMIT;
