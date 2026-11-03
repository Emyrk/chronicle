BEGIN;
DROP POLICY tenant_isolation ON guild_renown_kill_facts;
CREATE POLICY tenant_isolation ON guild_renown_kill_facts
    USING (realm_id IN (SELECT id FROM wow_server_realms));
DROP POLICY tenant_isolation ON guild_rating_boss_scores;
CREATE POLICY tenant_isolation ON guild_rating_boss_scores
    USING (realm_id IN (SELECT id FROM wow_server_realms));
DROP POLICY tenant_isolation ON guild_rating_scope_scores;
CREATE POLICY tenant_isolation ON guild_rating_scope_scores
    USING (realm_id IN (SELECT id FROM wow_server_realms));
COMMIT;
