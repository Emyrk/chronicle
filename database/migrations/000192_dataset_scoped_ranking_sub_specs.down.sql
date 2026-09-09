BEGIN;

DROP INDEX idx_rsm_cohort_spec;
CREATE INDEX idx_rsm_cohort_spec ON ranking_snapshot_members
    (snapshot_id, encounter_name, difficulty_name, max_players, player_class, player_spec);

ALTER TABLE parse_score_results DROP COLUMN player_sub_spec;
ALTER TABLE ranking_snapshot_members DROP COLUMN player_sub_spec;
ALTER TABLE encounter_dps_rankings DROP COLUMN player_sub_spec;

-- Collapse dataset-specific copies back to one build per class/layout.
WITH canonical AS (
    SELECT player_class, talent_layout, MIN(id::text)::uuid AS id
    FROM talent_builds
    GROUP BY player_class, talent_layout
)
UPDATE encounter_dps_rankings edr
SET talent_build_id = c.id
FROM talent_builds tb
JOIN canonical c
  ON c.player_class = tb.player_class
 AND c.talent_layout = tb.talent_layout
WHERE edr.talent_build_id = tb.id;

DELETE FROM talent_builds tb
USING talent_builds keep
WHERE tb.player_class = keep.player_class
  AND tb.talent_layout = keep.talent_layout
  AND tb.id > keep.id;

ALTER TABLE talent_builds
    DROP CONSTRAINT talent_builds_dataset_class_layout_key;
ALTER TABLE talent_builds
    DROP COLUMN dataset_id;
ALTER TABLE talent_builds
    ADD CONSTRAINT talent_builds_player_class_talent_layout_key
    UNIQUE (player_class, talent_layout);

COMMIT;
