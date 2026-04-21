-- Stores the canonical item membership for each item set, from ItemSet.dbc's ItemID array.
CREATE TABLE dbc_item_set_item (
    set_id INTEGER NOT NULL,
    item_entry INTEGER NOT NULL,
    PRIMARY KEY (set_id, item_entry)
);
