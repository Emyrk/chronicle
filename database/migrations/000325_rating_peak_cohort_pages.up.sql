BEGIN;
-- Resumable subject keyset for one dirty Peak cohort. A new observation
-- increments the dirty revision; the worker restarts at the first subject if
-- this stored revision differs. The foreign key discards progress on ack.
CREATE TABLE rating_peak_cohort_pages (
    tenant_id UUID NOT NULL,
    subject_kind TEXT NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL,
    max_players SMALLINT NOT NULL,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    player_sub_spec TEXT NOT NULL,
    performance_metric TEXT NOT NULL,
    revision BIGINT NOT NULL,
    after_realm_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    after_subject_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec,
                 player_sub_spec, performance_metric),
    FOREIGN KEY (tenant_id, subject_kind, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec,
                 player_sub_spec, performance_metric)
      REFERENCES rating_dirty_peak_cohorts (tenant_id, subject_kind, instance_name,
                 encounter_name, difficulty_name, max_players, player_class,
                 player_spec, player_sub_spec, performance_metric) ON DELETE CASCADE
);
-- Page exact cohort subjects without sorting the entire live evidence set.
CREATE INDEX rating_live_player_peak_page_idx ON rating_live_player_observations
    (tenant_id, instance_name, encounter_name, difficulty_name, max_players,
     player_class, player_spec, player_sub_spec, performance_metric, realm_id, player_guid);
CREATE INDEX rating_live_guild_peak_page_idx ON rating_live_guild_observations
    (tenant_id, instance_name, encounter_name, difficulty_name, max_players, realm_id, guild_id);
ALTER TABLE rating_peak_cohort_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_peak_cohort_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_admin_bypass ON rating_peak_cohort_pages
    USING (current_setting('app.tenant_bypass', true) = 'true')
    WITH CHECK (current_setting('app.tenant_bypass', true) = 'true');
CREATE POLICY tenant_isolation ON rating_peak_cohort_pages
    USING (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid))
    WITH CHECK (tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::uuid,
                                       '00000000-0000-0000-0000-000000000000'::uuid));
COMMIT;
