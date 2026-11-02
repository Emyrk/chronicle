BEGIN;

-- A realm visible through root RLS is not permission to attach a different
-- tenant's ID to its earned facts or score projections.
DROP POLICY tenant_isolation ON guild_renown_kill_facts;
CREATE POLICY tenant_isolation ON guild_renown_kill_facts
    USING (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_renown_kill_facts.tenant_id
    ))
    WITH CHECK (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_renown_kill_facts.tenant_id
    ));
DROP POLICY tenant_isolation ON guild_rating_boss_scores;
CREATE POLICY tenant_isolation ON guild_rating_boss_scores
    USING (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_rating_boss_scores.tenant_id
    ))
    WITH CHECK (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_rating_boss_scores.tenant_id
    ));
DROP POLICY tenant_isolation ON guild_rating_scope_scores;
CREATE POLICY tenant_isolation ON guild_rating_scope_scores
    USING (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_rating_scope_scores.tenant_id
    ))
    WITH CHECK (realm_id IN (
        SELECT realm.id FROM wow_server_realms realm
        JOIN wow_servers server ON server.id = realm.server_id
        WHERE COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = guild_rating_scope_scores.tenant_id
    ));
COMMIT;
