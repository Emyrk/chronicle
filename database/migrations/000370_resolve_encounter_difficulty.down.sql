BEGIN;

-- Rolling back discards the new per-attempt difficulty evidence. Reparse logs
-- after a rollback if the draft representation is needed again.
ALTER TABLE log_instance_encounters
    DROP COLUMN difficulty,
    ADD COLUMN difficulty_name text NOT NULL DEFAULT '',
    ADD COLUMN max_players integer NOT NULL DEFAULT 0 CHECK (max_players >= 0),
    ADD COLUMN dynamic_difficulty integer NOT NULL DEFAULT 0 CHECK (dynamic_difficulty >= 0);
DROP TABLE log_instance_difficulties;
CREATE TABLE log_instance_difficulties (
    instance_id uuid NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
    difficulty_name text NOT NULL,
    max_players integer NOT NULL CHECK (max_players >= 0),
    dynamic_difficulty integer NOT NULL DEFAULT 0 CHECK (dynamic_difficulty >= 0),
    PRIMARY KEY (instance_id, difficulty_name, max_players, dynamic_difficulty)
);
COMMIT;
