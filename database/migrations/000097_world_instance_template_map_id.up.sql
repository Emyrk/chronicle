BEGIN;

ALTER TABLE world_instance_template
  ADD COLUMN map_id INT;

COMMIT;