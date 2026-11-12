BEGIN;

-- NULL identifies a legacy encounter. Empty text is explicitly Normal and must
-- never inherit a heroic parent. Adding a nullable column does not rewrite rows.
ALTER TABLE log_instance_encounters
    ADD COLUMN difficulty text,
    DROP COLUMN difficulty_name,
    DROP COLUMN max_players,
    DROP COLUMN dynamic_difficulty;

-- This is a derived ingestion summary. Reads derive the set from boss attempts,
-- so discarding draft-format summary rows does not discard encounter evidence.
DROP TABLE log_instance_difficulties;
CREATE TABLE log_instance_difficulties (
    instance_id uuid NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    difficulty text NOT NULL,
    PRIMARY KEY (instance_id, difficulty)
);

-- No data backfill runs during startup. See the bounded preview/backfill sqlc
-- queries in encounter_difficulty_backfill.sql for explicit offline repair.
COMMIT;
