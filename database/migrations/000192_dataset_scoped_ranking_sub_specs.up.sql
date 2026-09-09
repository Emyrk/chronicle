BEGIN;

ALTER TABLE talent_builds
    ADD COLUMN dataset_id UUID REFERENCES datasets(id);

ALTER TABLE talent_builds
    DROP CONSTRAINT talent_builds_player_class_talent_layout_key;

-- Keep startup migration work bounded. Existing builds retain their ranking
-- references and are assigned to the well-known default dataset. Dataset-aware
-- copies will be created naturally when new logs are parsed. Historical builds
-- and ranking rows can be corrected later with manually supervised batches.
UPDATE talent_builds
SET dataset_id = '00000000-0000-0000-0000-000000000001'::uuid;

ALTER TABLE talent_builds
    ALTER COLUMN dataset_id SET NOT NULL;

ALTER TABLE talent_builds
    ADD CONSTRAINT talent_builds_dataset_class_layout_key
    UNIQUE (dataset_id, player_class, talent_layout);

-- Adding a non-null column with a constant default is metadata-only on modern
-- PostgreSQL and does not rewrite the existing ranking tables.
ALTER TABLE encounter_dps_rankings
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

ALTER TABLE ranking_snapshot_members
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

ALTER TABLE parse_score_results
    ADD COLUMN player_sub_spec TEXT NOT NULL DEFAULT '';

-- Keep the existing cohort index during deployment. It remains correct and its
-- leading columns are still useful. The sub-spec-aware replacement over the
-- large snapshot-members table will be built separately during maintenance.

COMMIT;
