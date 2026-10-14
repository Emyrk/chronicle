-- WARNING: this rollback recreates empty compatibility tables only. Historical
-- membership rows deleted by the up migration cannot be recovered.
BEGIN;

CREATE TABLE time_parse_clear_time_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES time_parse_snapshots(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    duration_ms BIGINT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    UNIQUE (snapshot_id, instance_id)
);
CREATE INDEX idx_tpctm_cohort ON time_parse_clear_time_members
    (snapshot_id, instance_name, difficulty_name, max_players);

CREATE TABLE time_parse_boss_kill_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES time_parse_snapshots(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    duration_ms BIGINT NOT NULL,
    killed_at TIMESTAMPTZ NOT NULL,
    UNIQUE (snapshot_id, instance_id, encounter_name)
);
CREATE INDEX idx_tpbkm_cohort ON time_parse_boss_kill_members
    (snapshot_id, instance_name, encounter_name, difficulty_name, max_players);

COMMIT;
