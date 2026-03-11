-- Extracted from ItemDisplayInfo.dbc at import time.
-- Full item display metadata used by tooltips (icon) and 3D model rendering.
CREATE TABLE dbc_item_display_info (
    id INTEGER PRIMARY KEY,
    -- Model file names (typically 2: left/right hand)
    model_name JSONB NOT NULL DEFAULT '[]',
    -- Model texture names (typically 2)
    model_texture JSONB NOT NULL DEFAULT '[]',
    -- Geoset group indices (typically 3)
    geoset_group JSONB NOT NULL DEFAULT '[]',
    flags INTEGER NOT NULL DEFAULT 0,
    spell_visual_id INTEGER NOT NULL DEFAULT 0,
    -- Helmet geoset visibility (typically 2)
    helmet_geoset_vis JSONB NOT NULL DEFAULT '[]',
    -- Texture file names (typically 8: arm_upper, arm_lower, hand, torso_upper, torso_lower, leg_upper, leg_lower, foot)
    texture JSONB NOT NULL DEFAULT '[]',
    item_visual INTEGER NOT NULL DEFAULT 0,
    particle_color_id INTEGER NOT NULL DEFAULT 0,
    -- Attachment geoset group (typically 2)
    attachment_geoset_group JSONB NOT NULL DEFAULT '[]',
    item_ranged_display_info_id INTEGER NOT NULL DEFAULT 0,
    -- Model material resources IDs (typically 2)
    model_material_resources_id JSONB NOT NULL DEFAULT '[]',
    -- Model resources IDs (typically 2)
    model_resources_id JSONB NOT NULL DEFAULT '[]',
    model_type_1 INTEGER NOT NULL DEFAULT 0,
    override_swoosh_sound_kit_id INTEGER NOT NULL DEFAULT 0,
    sheathe_transform_matrix_id INTEGER NOT NULL DEFAULT 0,
    sheathed_spell_visual_kit_id INTEGER NOT NULL DEFAULT 0,
    state_spell_visual_kit_id INTEGER NOT NULL DEFAULT 0,
    unsheathed_spell_visual_kit_id INTEGER NOT NULL DEFAULT 0,
    -- Inventory icon names (typically 2: icon, grey icon)
    inventory_icon JSONB NOT NULL DEFAULT '[]',
    group_sound_index INTEGER NOT NULL DEFAULT 0,
    ground_model TEXT NOT NULL DEFAULT '',
    item_size INTEGER NOT NULL DEFAULT 0,
    -- Helmet geoset visibility IDs (typically 2)
    helmet_geoset_vis_id JSONB NOT NULL DEFAULT '[]'
);
