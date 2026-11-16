BEGIN;

CREATE TABLE encounter_player_performance_invalidations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
  player_guid TEXT NOT NULL,
  player_name TEXT NOT NULL,
  encounter_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  invalidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_id, encounter_id, player_guid)
);

CREATE INDEX idx_encounter_player_performance_invalidations_instance
  ON encounter_player_performance_invalidations (instance_id);

ALTER TABLE encounter_player_performance_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounter_player_performance_invalidations FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_admin_bypass ON encounter_player_performance_invalidations
  USING (current_setting('app.tenant_bypass', true) = 'true')
  WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');

CREATE POLICY tenant_isolation ON encounter_player_performance_invalidations
  USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
  WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
