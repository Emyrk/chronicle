-- Extracted from ItemRandomProperties.dbc at import time.
-- Maps random property ID to suffix name ("of the Owl") and enchantment IDs.
-- Used by item tooltips to resolve random enchantment suffixes.
CREATE TABLE dbc_item_random_properties (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    name_lang TEXT NOT NULL DEFAULT '',
    enchantment_1 INTEGER NOT NULL DEFAULT 0,
    enchantment_2 INTEGER NOT NULL DEFAULT 0,
    enchantment_3 INTEGER NOT NULL DEFAULT 0,
    enchantment_4 INTEGER NOT NULL DEFAULT 0,
    enchantment_5 INTEGER NOT NULL DEFAULT 0
);

-- Extracted from ItemSet.dbc at import time.
-- Contains set names and set bonus spell/threshold pairs.
-- Item membership is determined by world_item_template.set_id referencing this table.
CREATE TABLE dbc_item_set (
    id INTEGER PRIMARY KEY,
    name_lang TEXT NOT NULL DEFAULT '',
    required_skill INTEGER NOT NULL DEFAULT 0,
    required_skill_rank INTEGER NOT NULL DEFAULT 0
);

-- Set bonus spells: each row is one bonus tier for a set.
-- threshold = number of pieces needed, spell_id = bonus spell granted.
CREATE TABLE dbc_item_set_bonus (
    set_id INTEGER NOT NULL,
    threshold INTEGER NOT NULL,
    spell_id INTEGER NOT NULL,
    PRIMARY KEY (set_id, threshold, spell_id)
);

-- Extracted from SpellItemEnchantment.dbc at import time.
-- Contains enchantment effect data, stat bonuses, and display names.
-- Used by item tooltips for both random suffixes and player-applied enchants.
CREATE TABLE dbc_spell_item_enchantment (
    id INTEGER PRIMARY KEY,
    charges INTEGER NOT NULL DEFAULT 0,
    effect_1 INTEGER NOT NULL DEFAULT 0,
    effect_2 INTEGER NOT NULL DEFAULT 0,
    effect_3 INTEGER NOT NULL DEFAULT 0,
    effect_points_min_1 INTEGER NOT NULL DEFAULT 0,
    effect_points_min_2 INTEGER NOT NULL DEFAULT 0,
    effect_points_min_3 INTEGER NOT NULL DEFAULT 0,
    effect_arg_1 INTEGER NOT NULL DEFAULT 0,
    effect_arg_2 INTEGER NOT NULL DEFAULT 0,
    effect_arg_3 INTEGER NOT NULL DEFAULT 0,
    name_lang TEXT NOT NULL DEFAULT '',
    item_visual INTEGER NOT NULL DEFAULT 0,
    flags INTEGER NOT NULL DEFAULT 0,
    src_item_id INTEGER NOT NULL DEFAULT 0,
    condition_id INTEGER NOT NULL DEFAULT 0,
    required_skill_id INTEGER NOT NULL DEFAULT 0,
    required_skill_rank INTEGER NOT NULL DEFAULT 0,
    min_level INTEGER NOT NULL DEFAULT 0,
    max_level INTEGER NOT NULL DEFAULT 0
);
