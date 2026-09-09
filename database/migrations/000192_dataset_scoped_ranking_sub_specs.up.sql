BEGIN;

ALTER TABLE talent_builds
    ADD COLUMN dataset_id UUID REFERENCES datasets(id);

ALTER TABLE talent_builds
    DROP CONSTRAINT talent_builds_player_class_talent_layout_key;

ALTER TABLE talent_builds
    ADD CONSTRAINT talent_builds_dataset_class_layout_key
    UNIQUE (dataset_id, player_class, talent_layout);

-- A server has historically used one dataset. Resolve existing builds through
-- each ranking row's current realm -> server -> tenant dataset assignment.
WITH referenced_builds AS (
    SELECT DISTINCT
        edr.talent_build_id AS old_id,
        COALESCE(s.default_dataset_id, t.default_dataset_id,
                 '00000000-0000-0000-0000-000000000001'::uuid) AS dataset_id
    FROM encounter_dps_rankings edr
    JOIN wow_server_realms r ON r.id = edr.realm_id
    JOIN wow_servers s ON s.id = r.server_id
    LEFT JOIN tenants t ON t.id = s.tenant_id
    WHERE edr.talent_build_id IS NOT NULL
), inserted AS (
    INSERT INTO talent_builds (
        dataset_id, player_class, talent_summary, talent_layout, spec, sub_spec, created_at
    )
    SELECT rb.dataset_id, tb.player_class, tb.talent_summary, tb.talent_layout,
           tb.spec, tb.sub_spec, tb.created_at
    FROM referenced_builds rb
    JOIN talent_builds tb ON tb.id = rb.old_id
    ON CONFLICT (dataset_id, player_class, talent_layout) DO NOTHING
    RETURNING id
)
SELECT COUNT(*) FROM inserted;

WITH ranking_datasets AS (
    SELECT
        edr.id AS ranking_id,
        edr.talent_build_id AS old_build_id,
        COALESCE(s.default_dataset_id, t.default_dataset_id,
                 '00000000-0000-0000-0000-000000000001'::uuid) AS dataset_id
    FROM encounter_dps_rankings edr
    JOIN wow_server_realms r ON r.id = edr.realm_id
    JOIN wow_servers s ON s.id = r.server_id
    LEFT JOIN tenants t ON t.id = s.tenant_id
    WHERE edr.talent_build_id IS NOT NULL
)
UPDATE encounter_dps_rankings edr
SET talent_build_id = scoped.id
FROM ranking_datasets rd
JOIN talent_builds old ON old.id = rd.old_build_id
JOIN talent_builds scoped
  ON scoped.dataset_id = rd.dataset_id
 AND scoped.player_class = old.player_class
 AND scoped.talent_layout = old.talent_layout
WHERE edr.id = rd.ranking_id;

DELETE FROM talent_builds tb
WHERE tb.dataset_id IS NULL
  AND EXISTS (
      SELECT 1 FROM talent_builds scoped
      WHERE scoped.dataset_id IS NOT NULL
        AND scoped.player_class = tb.player_class
        AND scoped.talent_layout = tb.talent_layout
  );

UPDATE talent_builds
SET dataset_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE dataset_id IS NULL;

ALTER TABLE talent_builds
    ALTER COLUMN dataset_id SET NOT NULL;

ALTER TABLE encounter_dps_rankings
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

ALTER TABLE ranking_snapshot_members
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

ALTER TABLE parse_score_results
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

DROP INDEX idx_rsm_cohort_spec;
CREATE INDEX idx_rsm_cohort_spec ON ranking_snapshot_members
    (snapshot_id, encounter_name, difficulty_name, max_players,
     player_class, player_spec, player_sub_spec);

COMMIT;
