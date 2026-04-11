CREATE TABLE instance_loot (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id   UUID NOT NULL REFERENCES log_instances(id) ON DELETE CASCADE INITIALLY DEFERRED,
    realm_id      UUID NOT NULL,
    -- Who originally looted
    source_guid   BIGINT NOT NULL,
    source_ts     TIMESTAMPTZ NOT NULL,
    -- Who ended up with the item (after trades)
    received_guid BIGINT NOT NULL,
    received_ts   TIMESTAMPTZ NOT NULL,
    -- Item info
    item_id       INT NOT NULL,
    item_name     TEXT NOT NULL,
    loot_suffix   INT NOT NULL DEFAULT 0,
    quantity      INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_instance_loot_instance ON instance_loot(instance_id);
CREATE INDEX idx_instance_loot_received ON instance_loot(received_guid);
CREATE INDEX idx_instance_loot_item ON instance_loot(item_id);
