BEGIN;

ALTER TABLE world_item_template
    DROP COLUMN icon;

COMMIT;
