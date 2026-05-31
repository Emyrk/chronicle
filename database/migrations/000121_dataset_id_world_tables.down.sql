-- Reverse: remove dataset_id from all world_*/dbc_* tables and restore original PKs.
-- WARNING: this deletes all non-default dataset data.

-- Delete non-default rows (can't have duplicate PKs after removing dataset_id)
DELETE FROM world_creature_template WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_item_template WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_display_info WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_spell_chain WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_spell_threat WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_item_enchantment WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_spell_area WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_spell_group WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM world_spell_threat WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_item_display_info WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_item_random_properties WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_item_set WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_item_set_bonus WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_item_set_item WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
DELETE FROM dbc_spell_item_enchantment WHERE dataset_id != '00000000-0000-0000-0000-000000000001';

-- world_server: restore FKs and PK
ALTER TABLE world_server DROP CONSTRAINT IF EXISTS world_server_server_id_fkey;
ALTER TABLE world_server DROP CONSTRAINT IF EXISTS world_server_world_id_fkey;
ALTER TABLE world_server DROP CONSTRAINT world_server_pkey;
DELETE FROM world_server WHERE dataset_id != '00000000-0000-0000-0000-000000000001';
ALTER TABLE world_server DROP COLUMN dataset_id;
ALTER TABLE world_server ADD PRIMARY KEY (server_id, world_id);
ALTER TABLE world_server ADD CONSTRAINT world_server_server_id_fkey FOREIGN KEY (server_id) REFERENCES wow_servers(id) ON DELETE CASCADE;
ALTER TABLE world_server ADD CONSTRAINT world_server_world_id_fkey FOREIGN KEY (world_id) REFERENCES world(id) ON DELETE CASCADE;

-- Single-column PK tables
ALTER TABLE world_creature_template DROP CONSTRAINT world_creature_template_pkey;
ALTER TABLE world_creature_template DROP COLUMN dataset_id;
ALTER TABLE world_creature_template ADD PRIMARY KEY (entry);
DROP INDEX IF EXISTS idx_world_creature_template_name;
CREATE INDEX idx_world_creature_template_name ON world_creature_template (name);

ALTER TABLE world_item_template DROP CONSTRAINT world_item_template_pkey;
ALTER TABLE world_item_template DROP COLUMN dataset_id;
ALTER TABLE world_item_template ADD PRIMARY KEY (entry);
DROP INDEX IF EXISTS idx_world_item_template_name;
CREATE INDEX idx_world_item_template_name ON world_item_template (name);

ALTER TABLE world_display_info DROP CONSTRAINT world_display_info_pkey;
ALTER TABLE world_display_info DROP COLUMN dataset_id;
ALTER TABLE world_display_info ADD PRIMARY KEY (id);

ALTER TABLE world_spell_chain DROP CONSTRAINT world_spell_chain_pkey;
ALTER TABLE world_spell_chain DROP COLUMN dataset_id;
ALTER TABLE world_spell_chain ADD PRIMARY KEY (spell_id);

ALTER TABLE world_spell_threat DROP CONSTRAINT world_spell_threat_pkey;
ALTER TABLE world_spell_threat DROP COLUMN dataset_id;
ALTER TABLE world_spell_threat ADD PRIMARY KEY (entry);

ALTER TABLE dbc_item_display_info DROP CONSTRAINT dbc_item_display_info_pkey;
ALTER TABLE dbc_item_display_info DROP COLUMN dataset_id;
ALTER TABLE dbc_item_display_info ADD PRIMARY KEY (id);

ALTER TABLE dbc_item_random_properties DROP CONSTRAINT dbc_item_random_properties_pkey;
ALTER TABLE dbc_item_random_properties DROP COLUMN dataset_id;
ALTER TABLE dbc_item_random_properties ADD PRIMARY KEY (id);

ALTER TABLE dbc_item_set DROP CONSTRAINT dbc_item_set_pkey;
ALTER TABLE dbc_item_set DROP COLUMN dataset_id;
ALTER TABLE dbc_item_set ADD PRIMARY KEY (id);

ALTER TABLE dbc_spell_item_enchantment DROP CONSTRAINT dbc_spell_item_enchantment_pkey;
ALTER TABLE dbc_spell_item_enchantment DROP COLUMN dataset_id;
ALTER TABLE dbc_spell_item_enchantment ADD PRIMARY KEY (id);

-- Composite PK tables
ALTER TABLE world_item_enchantment DROP CONSTRAINT world_item_enchantment_pkey;
ALTER TABLE world_item_enchantment DROP COLUMN dataset_id;
ALTER TABLE world_item_enchantment ADD PRIMARY KEY (entry, ench);

ALTER TABLE world_spell_area DROP CONSTRAINT world_spell_area_pkey;
ALTER TABLE world_spell_area DROP COLUMN dataset_id;
ALTER TABLE world_spell_area ADD PRIMARY KEY (spell, area);

ALTER TABLE world_spell_group DROP CONSTRAINT world_spell_group_pkey;
ALTER TABLE world_spell_group DROP COLUMN dataset_id;
ALTER TABLE world_spell_group ADD PRIMARY KEY (group_id, spell_id);

ALTER TABLE dbc_item_set_bonus DROP CONSTRAINT dbc_item_set_bonus_pkey;
ALTER TABLE dbc_item_set_bonus DROP COLUMN dataset_id;
ALTER TABLE dbc_item_set_bonus ADD PRIMARY KEY (set_id, threshold, spell_id);

ALTER TABLE dbc_item_set_item DROP CONSTRAINT dbc_item_set_item_pkey;
ALTER TABLE dbc_item_set_item DROP COLUMN dataset_id;
ALTER TABLE dbc_item_set_item ADD PRIMARY KEY (set_id, item_entry);

-- Remove default dataset
DELETE FROM datasets WHERE id = '00000000-0000-0000-0000-000000000001';
