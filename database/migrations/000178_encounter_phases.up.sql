CREATE TABLE log_instance_encounter_phases (
    id UUID NOT NULL,
    encounter_id UUID NOT NULL REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    name TEXT NOT NULL,
    phase_order INT NOT NULL,
    start_offset_ms BIGINT NOT NULL,
    end_offset_ms BIGINT NOT NULL,
    PRIMARY KEY (id)
);

CREATE INDEX idx_log_instance_encounter_phases_encounter_id
    ON log_instance_encounter_phases (encounter_id);
