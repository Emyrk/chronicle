ALTER TABLE log_instances
  ADD COLUMN start_time TIMESTAMPTZ,
  ADD COLUMN end_time TIMESTAMPTZ;

-- Backfill from existing encounter data
UPDATE log_instances li
SET
  start_time = enc_range.min_start,
  end_time = enc_range.max_end
FROM (
  SELECT
    instance_id,
    MIN(start_time) AS min_start,
    MAX(end_time) AS max_end
  FROM log_instance_encounters
  GROUP BY instance_id
) enc_range
WHERE li.id = enc_range.instance_id;
