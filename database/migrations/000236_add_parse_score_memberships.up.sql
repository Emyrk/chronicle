BEGIN;

-- Compact current-known DPS/HPS cohort membership. One row represents one
-- eligible player encounter from the representative upload for a logical run.
-- Scoring windows are applied at read time from the target instance start_time.
CREATE TABLE parse_score_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_version SMALLINT NOT NULL,
    query_version SMALLINT NOT NULL,
    run_id UUID NOT NULL,
    encounter_name TEXT NOT NULL,
    player_guid TEXT NOT NULL,
    instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    log_group_id UUID NOT NULL REFERENCES wow_log_groups(id) ON DELETE CASCADE,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    player_sub_spec TEXT NOT NULL DEFAULT '',
    killed_at TIMESTAMPTZ NOT NULL,
    dps DOUBLE PRECISION NOT NULL,
    hps DOUBLE PRECISION NOT NULL DEFAULT 0,
    UNIQUE (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid)
);

-- This intentionally scans current ranking rows once at startup. Operators can
-- preview the upper bound with: SELECT count(*) FROM encounter_dps_rankings
-- WHERE encounter_id IS NOT NULL AND (dps > 0 OR hps > 0) AND duration_secs > 0;
WITH coverage_counts AS MATERIALIZED (
    SELECT instance_id, COUNT(DISTINCT encounter_name) AS encounter_count
    FROM encounter_dps_rankings
    WHERE encounter_id IS NOT NULL
    GROUP BY instance_id
),
representative_instances AS MATERIALIZED (
    SELECT DISTINCT ON (COALESCE(instance.duplicate_group_id, instance.id))
        instance.id,
        COALESCE(instance.duplicate_group_id, instance.id) AS run_id
    FROM log_instances instance
    LEFT JOIN coverage_counts coverage ON coverage.instance_id = instance.id
    WHERE instance.invalidated_at IS NULL
    ORDER BY COALESCE(instance.duplicate_group_id, instance.id),
        COALESCE(coverage.encounter_count, 0) DESC,
        (instance.id = instance.duplicate_group_id) DESC NULLS LAST,
        instance.start_time ASC,
        instance.id ASC
),
eligible AS (
    SELECT DISTINCT ON (representative.run_id, ranking.encounter_name, ranking.player_guid)
        COALESCE(server.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
        representative.run_id,
        ranking.encounter_name,
        ranking.player_guid,
        ranking.instance_id,
        instance.log_group_id,
        ranking.difficulty_name,
        ranking.max_players,
        ranking.player_class,
        ranking.player_spec,
        ranking.player_sub_spec,
        ranking.killed_at,
        ranking.dps,
        ranking.hps
    FROM encounter_dps_rankings ranking
    JOIN representative_instances representative ON representative.id = ranking.instance_id
    JOIN log_instances instance ON instance.id = ranking.instance_id
    JOIN wow_server_realms realm ON realm.id = instance.realm_id
    JOIN wow_servers server ON server.id = realm.server_id
    WHERE ranking.encounter_id IS NOT NULL
      AND (ranking.dps > 0 OR ranking.hps > 0)
      AND ranking.duration_secs > 0
      AND lower(btrim(ranking.player_class)) NOT IN ('', 'unknown')
    ORDER BY representative.run_id, ranking.encounter_name, ranking.player_guid,
             ranking.dps DESC, ranking.hps DESC
)
INSERT INTO parse_score_memberships (
    tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
    instance_id, log_group_id, difficulty_name, max_players,
    player_class, player_spec, player_sub_spec, killed_at, dps, hps
)
SELECT
    eligible.tenant_id, 1, 4, eligible.run_id, eligible.encounter_name, eligible.player_guid,
    eligible.instance_id, eligible.log_group_id, eligible.difficulty_name, eligible.max_players, eligible.player_class,
    eligible.player_spec, eligible.player_sub_spec, eligible.killed_at,
    eligible.dps, eligible.hps
FROM eligible;

CREATE INDEX idx_parse_score_memberships_log_group
    ON parse_score_memberships (log_group_id);
CREATE INDEX idx_parse_score_memberships_instance
    ON parse_score_memberships (instance_id);
CREATE INDEX idx_parse_score_memberships_cohort
    ON parse_score_memberships (
        tenant_id, policy_version, query_version,
        encounter_name, difficulty_name, max_players,
        player_class, player_spec, player_sub_spec, killed_at
    );

-- New window-based receipts have no ranking snapshot. Keep all legacy rows and
-- their foreign-key behavior intact.
ALTER TABLE parse_score_receipts ALTER COLUMN snapshot_id DROP NOT NULL;
ALTER TABLE parse_score_receipts
    ADD COLUMN cutoff TIMESTAMPTZ,
    ADD COLUMN window_start TIMESTAMPTZ,
    ADD COLUMN cohort_mode TEXT;
ALTER TABLE parse_score_receipts
    DROP CONSTRAINT parse_score_receipts_tenant_id_instance_id_snapshot_id_look_key;
CREATE UNIQUE INDEX idx_parse_score_receipts_legacy_contract
    ON parse_score_receipts (tenant_id, instance_id, snapshot_id, lookback_days, policy_version, query_version)
    WHERE snapshot_id IS NOT NULL;
CREATE UNIQUE INDEX idx_parse_score_receipts_window_contract
    ON parse_score_receipts (tenant_id, instance_id, lookback_days, policy_version, query_version)
    WHERE snapshot_id IS NULL;

COMMIT;
