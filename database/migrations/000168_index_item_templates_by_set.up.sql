BEGIN;

CREATE INDEX IF NOT EXISTS idx_world_item_template_dataset_set_inventory_type
    ON world_item_template (dataset_id, set_id, inventory_type);

COMMIT;
