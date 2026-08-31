BEGIN;

CREATE TYPE raid_group_snapshot_type AS ENUM ('clean_kill', 'final');

CREATE TABLE log_instance_raid_group_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES log_instance_encounters(id) ON DELETE CASCADE,
  snapshot_type raid_group_snapshot_type NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  composition JSONB NOT NULL,
  CONSTRAINT raid_group_snapshot_encounter_chk CHECK (
    (snapshot_type = 'clean_kill' AND encounter_id IS NOT NULL) OR
    (snapshot_type = 'final' AND encounter_id IS NULL)
  )
);

CREATE UNIQUE INDEX log_instance_raid_group_clean_kill_idx
  ON log_instance_raid_group_snapshots (encounter_id)
  WHERE snapshot_type = 'clean_kill';
CREATE UNIQUE INDEX log_instance_raid_group_final_idx
  ON log_instance_raid_group_snapshots (instance_id)
  WHERE snapshot_type = 'final';

COMMIT;
