BEGIN;
-- Durable per-table keyset cursors. No existing rows are scanned or rewritten.
CREATE TABLE tenant_rating_copy_progress (
    tenant_id UUID NOT NULL,
    generation_id UUID NOT NULL,
    table_name TEXT NOT NULL CHECK (table_name IN (
        'player_boss', 'player_scope', 'guild_boss', 'guild_scope', 'peak')),
    after_key JSONB,
    completed BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (tenant_id, table_name),
    FOREIGN KEY (generation_id, tenant_id) REFERENCES rating_score_generations(id, tenant_id)
);
ALTER TABLE tenant_rating_copy_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_rating_copy_progress FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON tenant_rating_copy_progress
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON tenant_rating_copy_progress
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                 '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                      '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
