-- Insert the well-known default dataset.
-- wow_version and build_version are placeholders — Go startup upserts the
-- correct values from the compiled-in build tags.
INSERT INTO datasets (id, name, slug, wow_version, build_version, description)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'default',
    'default',
    '1.12.1',
    5875,
    'Default dataset for existing game data'
) ON CONFLICT (id) DO NOTHING;

-- ─── Single-column PK tables ─────────────────────────────────────

-- world_creature_template: PK (entry) → (dataset_id, entry)
ALTER TABLE world_creature_template ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_creature_template DROP CONSTRAINT world_creature_template_pkey;
ALTER TABLE world_creature_template ADD PRIMARY KEY (dataset_id, entry);
ALTER TABLE world_creature_template ALTER COLUMN dataset_id DROP DEFAULT;
DROP INDEX IF EXISTS idx_world_creature_template_name;
CREATE INDEX idx_world_creature_template_name ON world_creature_template (dataset_id, name);

-- world_item_template: PK (entry) → (dataset_id, entry)
ALTER TABLE world_item_template ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_item_template DROP CONSTRAINT world_item_template_pkey;
ALTER TABLE world_item_template ADD PRIMARY KEY (dataset_id, entry);
ALTER TABLE world_item_template ALTER COLUMN dataset_id DROP DEFAULT;
DROP INDEX IF EXISTS idx_world_item_template_name;
CREATE INDEX idx_world_item_template_name ON world_item_template (dataset_id, name);

-- world_display_info: PK (id) → (dataset_id, id)
ALTER TABLE world_display_info ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_display_info DROP CONSTRAINT world_display_info_pkey;
ALTER TABLE world_display_info ADD PRIMARY KEY (dataset_id, id);
ALTER TABLE world_display_info ALTER COLUMN dataset_id DROP DEFAULT;

-- world_spell_chain: PK (spell_id) → (dataset_id, spell_id)
ALTER TABLE world_spell_chain ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_spell_chain DROP CONSTRAINT world_spell_chain_pkey;
ALTER TABLE world_spell_chain ADD PRIMARY KEY (dataset_id, spell_id);
ALTER TABLE world_spell_chain ALTER COLUMN dataset_id DROP DEFAULT;

-- world_spell_threat: PK (entry) → (dataset_id, entry)
ALTER TABLE world_spell_threat ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_spell_threat DROP CONSTRAINT world_spell_threat_pkey;
ALTER TABLE world_spell_threat ADD PRIMARY KEY (dataset_id, entry);
ALTER TABLE world_spell_threat ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_item_display_info: PK (id) → (dataset_id, id)
ALTER TABLE dbc_item_display_info ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_item_display_info DROP CONSTRAINT dbc_item_display_info_pkey;
ALTER TABLE dbc_item_display_info ADD PRIMARY KEY (dataset_id, id);
ALTER TABLE dbc_item_display_info ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_item_random_properties: PK (id) → (dataset_id, id)
ALTER TABLE dbc_item_random_properties ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_item_random_properties DROP CONSTRAINT dbc_item_random_properties_pkey;
ALTER TABLE dbc_item_random_properties ADD PRIMARY KEY (dataset_id, id);
ALTER TABLE dbc_item_random_properties ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_item_set: PK (id) → (dataset_id, id)
ALTER TABLE dbc_item_set ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_item_set DROP CONSTRAINT dbc_item_set_pkey;
ALTER TABLE dbc_item_set ADD PRIMARY KEY (dataset_id, id);
ALTER TABLE dbc_item_set ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_spell_item_enchantment: PK (id) → (dataset_id, id)
ALTER TABLE dbc_spell_item_enchantment ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_spell_item_enchantment DROP CONSTRAINT dbc_spell_item_enchantment_pkey;
ALTER TABLE dbc_spell_item_enchantment ADD PRIMARY KEY (dataset_id, id);
ALTER TABLE dbc_spell_item_enchantment ALTER COLUMN dataset_id DROP DEFAULT;

-- ─── Composite PK tables ─────────────────────────────────────────

-- world_item_enchantment: PK (entry, ench) → (dataset_id, entry, ench)
ALTER TABLE world_item_enchantment ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_item_enchantment DROP CONSTRAINT world_item_enchantment_pkey;
ALTER TABLE world_item_enchantment ADD PRIMARY KEY (dataset_id, entry, ench);
ALTER TABLE world_item_enchantment ALTER COLUMN dataset_id DROP DEFAULT;

-- world_spell_area: PK (spell, area) → (dataset_id, spell, area)
ALTER TABLE world_spell_area ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_spell_area DROP CONSTRAINT world_spell_area_pkey;
ALTER TABLE world_spell_area ADD PRIMARY KEY (dataset_id, spell, area);
ALTER TABLE world_spell_area ALTER COLUMN dataset_id DROP DEFAULT;

-- world_spell_group: PK (group_id, spell_id) → (dataset_id, group_id, spell_id)
ALTER TABLE world_spell_group ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_spell_group DROP CONSTRAINT world_spell_group_pkey;
ALTER TABLE world_spell_group ADD PRIMARY KEY (dataset_id, group_id, spell_id);
ALTER TABLE world_spell_group ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_item_set_bonus: PK (set_id, threshold, spell_id) → (dataset_id, set_id, threshold, spell_id)
ALTER TABLE dbc_item_set_bonus ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_item_set_bonus DROP CONSTRAINT dbc_item_set_bonus_pkey;
ALTER TABLE dbc_item_set_bonus ADD PRIMARY KEY (dataset_id, set_id, threshold, spell_id);
ALTER TABLE dbc_item_set_bonus ALTER COLUMN dataset_id DROP DEFAULT;

-- dbc_item_set_item: PK (set_id, item_entry) → (dataset_id, set_id, item_entry)
ALTER TABLE dbc_item_set_item ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE dbc_item_set_item DROP CONSTRAINT dbc_item_set_item_pkey;
ALTER TABLE dbc_item_set_item ADD PRIMARY KEY (dataset_id, set_id, item_entry);
ALTER TABLE dbc_item_set_item ALTER COLUMN dataset_id DROP DEFAULT;

-- ─── world_server: has external FKs ──────────────────────────────

-- world_server: PK (server_id, world_id) → (dataset_id, server_id, world_id)
-- Must drop FKs first, recreate after.
ALTER TABLE world_server DROP CONSTRAINT IF EXISTS world_server_server_id_fkey;
ALTER TABLE world_server DROP CONSTRAINT IF EXISTS world_server_world_id_fkey;
ALTER TABLE world_server ADD COLUMN dataset_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES datasets(id);
ALTER TABLE world_server DROP CONSTRAINT world_server_pkey;
ALTER TABLE world_server ADD PRIMARY KEY (dataset_id, server_id, world_id);
ALTER TABLE world_server ALTER COLUMN dataset_id DROP DEFAULT;
ALTER TABLE world_server ADD CONSTRAINT world_server_server_id_fkey FOREIGN KEY (server_id) REFERENCES wow_servers(id) ON DELETE CASCADE;
ALTER TABLE world_server ADD CONSTRAINT world_server_world_id_fkey FOREIGN KEY (world_id) REFERENCES world(id) ON DELETE CASCADE;
