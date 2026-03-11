-- World data tables for Turtle WoW game data import.
-- These are populated by the `chronicle import-world` CLI command.

-- Drop orphaned enum type from migration 000003 (was used by spell_templates,
-- which was dropped in migration 000020 without cleaning up the type).
DROP TYPE IF EXISTS spell_school;

-- Maps item/creature display IDs to their inventory icon filenames (e.g. "INV_Sword_04").
-- Used to show item/equipment icons in the UI.
CREATE TABLE world_display_info (
    id INTEGER PRIMARY KEY,
    icon TEXT NOT NULL DEFAULT ''
);

-- Creature spawn points in the game world. Each row is a specific spawn with a unique guid,
-- linking to creature_template entries (id, id2-id4 for random spawn pools) on a given map ID.
CREATE TABLE world_creature_spawn (
    guid INTEGER PRIMARY KEY,
    id INTEGER NOT NULL DEFAULT 0,
    id2 INTEGER NOT NULL DEFAULT 0,
    id3 INTEGER NOT NULL DEFAULT 0,
    id4 INTEGER NOT NULL DEFAULT 0,
    map INTEGER NOT NULL DEFAULT 0
);

-- Base stats and properties for every creature/NPC type. Entry is the creature ID used in
-- combat log GUIDs. Contains display models, name, level range, health/mana, damage, armor,
-- resistances, and immunity masks.
CREATE TABLE world_creature_template (
    entry INTEGER PRIMARY KEY,
    display_id1 INTEGER NOT NULL DEFAULT 0,
    display_id2 INTEGER NOT NULL DEFAULT 0,
    display_id3 INTEGER NOT NULL DEFAULT 0,
    display_id4 INTEGER NOT NULL DEFAULT 0,
    mount_display_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    subname TEXT,
    level_min INTEGER NOT NULL DEFAULT 0,
    level_max INTEGER NOT NULL DEFAULT 0,
    health_min INTEGER NOT NULL DEFAULT 0,
    health_max INTEGER NOT NULL DEFAULT 0,
    mana_min INTEGER NOT NULL DEFAULT 0,
    mana_max INTEGER NOT NULL DEFAULT 0,
    armor INTEGER NOT NULL DEFAULT 0,
    dmg_min INTEGER NOT NULL DEFAULT 0,
    dmg_max INTEGER NOT NULL DEFAULT 0,
    dmg_school INTEGER NOT NULL DEFAULT 0,
    attack_power INTEGER NOT NULL DEFAULT 0,
    dmg_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
    base_attack_time INTEGER NOT NULL DEFAULT 0,
    ranged_attack_time INTEGER NOT NULL DEFAULT 0,
    unit_class INTEGER NOT NULL DEFAULT 0,
    unit_flags INTEGER NOT NULL DEFAULT 0,
    ranged_dmg_min DOUBLE PRECISION NOT NULL DEFAULT 0,
    ranged_dmg_max DOUBLE PRECISION NOT NULL DEFAULT 0,
    holy_res INTEGER NOT NULL DEFAULT 0,
    fire_res INTEGER NOT NULL DEFAULT 0,
    nature_res INTEGER NOT NULL DEFAULT 0,
    frost_res INTEGER NOT NULL DEFAULT 0,
    shadow_res INTEGER NOT NULL DEFAULT 0,
    arcane_res INTEGER NOT NULL DEFAULT 0,
    mechanic_immune_mask BIGINT NOT NULL DEFAULT 0,
    school_immune_mask INTEGER NOT NULL DEFAULT 0,
    immunity_flags INTEGER NOT NULL DEFAULT 0
);

-- Random enchantment drop table. Maps item entries to possible random enchantment IDs
-- with their drop chance percentage. Used for items with random suffixes like "of the Bear".
CREATE TABLE world_item_enchantment (
    entry INTEGER NOT NULL,
    ench INTEGER NOT NULL,
    chance DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (entry, ench)
);

-- Complete item database. Every equippable item, consumable, quest item, etc. Contains
-- stats, damage ranges, spell effects, requirements, quality, and vendor pricing.
-- Entry is the item ID referenced throughout the game.
CREATE TABLE world_item_template (
    entry INTEGER PRIMARY KEY,
    class INTEGER NOT NULL DEFAULT 0,
    subclass INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    display_id INTEGER NOT NULL DEFAULT 0,
    quality INTEGER NOT NULL DEFAULT 0,
    flags INTEGER NOT NULL DEFAULT 0,
    buy_count INTEGER NOT NULL DEFAULT 0,
    buy_price INTEGER NOT NULL DEFAULT 0,
    sell_price INTEGER NOT NULL DEFAULT 0,
    inventory_type INTEGER NOT NULL DEFAULT 0,
    allowable_class INTEGER NOT NULL DEFAULT -1,
    allowable_race INTEGER NOT NULL DEFAULT -1,
    item_level INTEGER NOT NULL DEFAULT 0,
    required_level INTEGER NOT NULL DEFAULT 0,
    required_skill INTEGER NOT NULL DEFAULT 0,
    required_skill_rank INTEGER NOT NULL DEFAULT 0,
    required_spell INTEGER NOT NULL DEFAULT 0,
    required_honor_rank INTEGER NOT NULL DEFAULT 0,
    required_city_rank INTEGER NOT NULL DEFAULT 0,
    required_reputation_faction INTEGER NOT NULL DEFAULT 0,
    required_reputation_rank INTEGER NOT NULL DEFAULT 0,
    max_count INTEGER NOT NULL DEFAULT 0,
    stackable INTEGER NOT NULL DEFAULT 1,
    container_slots INTEGER NOT NULL DEFAULT 0,
    stat_type1 INTEGER NOT NULL DEFAULT 0,
    stat_value1 INTEGER NOT NULL DEFAULT 0,
    stat_type2 INTEGER NOT NULL DEFAULT 0,
    stat_value2 INTEGER NOT NULL DEFAULT 0,
    stat_type3 INTEGER NOT NULL DEFAULT 0,
    stat_value3 INTEGER NOT NULL DEFAULT 0,
    stat_type4 INTEGER NOT NULL DEFAULT 0,
    stat_value4 INTEGER NOT NULL DEFAULT 0,
    stat_type5 INTEGER NOT NULL DEFAULT 0,
    stat_value5 INTEGER NOT NULL DEFAULT 0,
    stat_type6 INTEGER NOT NULL DEFAULT 0,
    stat_value6 INTEGER NOT NULL DEFAULT 0,
    stat_type7 INTEGER NOT NULL DEFAULT 0,
    stat_value7 INTEGER NOT NULL DEFAULT 0,
    stat_type8 INTEGER NOT NULL DEFAULT 0,
    stat_value8 INTEGER NOT NULL DEFAULT 0,
    stat_type9 INTEGER NOT NULL DEFAULT 0,
    stat_value9 INTEGER NOT NULL DEFAULT 0,
    stat_type10 INTEGER NOT NULL DEFAULT 0,
    stat_value10 INTEGER NOT NULL DEFAULT 0,
    delay INTEGER NOT NULL DEFAULT 0,
    range_mod DOUBLE PRECISION NOT NULL DEFAULT 0,
    ammo_type INTEGER NOT NULL DEFAULT 0,
    dmg_min1 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_max1 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_type1 INTEGER NOT NULL DEFAULT 0,
    dmg_min2 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_max2 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_type2 INTEGER NOT NULL DEFAULT 0,
    dmg_min3 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_max3 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_type3 INTEGER NOT NULL DEFAULT 0,
    dmg_min4 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_max4 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_type4 INTEGER NOT NULL DEFAULT 0,
    dmg_min5 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_max5 DOUBLE PRECISION NOT NULL DEFAULT 0,
    dmg_type5 INTEGER NOT NULL DEFAULT 0,
    block INTEGER NOT NULL DEFAULT 0,
    armor INTEGER NOT NULL DEFAULT 0,
    holy_res INTEGER NOT NULL DEFAULT 0,
    fire_res INTEGER NOT NULL DEFAULT 0,
    nature_res INTEGER NOT NULL DEFAULT 0,
    frost_res INTEGER NOT NULL DEFAULT 0,
    shadow_res INTEGER NOT NULL DEFAULT 0,
    arcane_res INTEGER NOT NULL DEFAULT 0,
    spellid_1 INTEGER NOT NULL DEFAULT 0,
    spelltrigger_1 INTEGER NOT NULL DEFAULT 0,
    spellcharges_1 INTEGER NOT NULL DEFAULT 0,
    spellppmrate_1 DOUBLE PRECISION NOT NULL DEFAULT 0,
    spellcooldown_1 INTEGER NOT NULL DEFAULT -1,
    spellcategory_1 INTEGER NOT NULL DEFAULT 0,
    spellcategorycooldown_1 INTEGER NOT NULL DEFAULT -1,
    spellid_2 INTEGER NOT NULL DEFAULT 0,
    spelltrigger_2 INTEGER NOT NULL DEFAULT 0,
    spellcharges_2 INTEGER NOT NULL DEFAULT 0,
    spellppmrate_2 DOUBLE PRECISION NOT NULL DEFAULT 0,
    spellcooldown_2 INTEGER NOT NULL DEFAULT -1,
    spellcategory_2 INTEGER NOT NULL DEFAULT 0,
    spellcategorycooldown_2 INTEGER NOT NULL DEFAULT -1,
    spellid_3 INTEGER NOT NULL DEFAULT 0,
    spelltrigger_3 INTEGER NOT NULL DEFAULT 0,
    spellcharges_3 INTEGER NOT NULL DEFAULT 0,
    spellppmrate_3 DOUBLE PRECISION NOT NULL DEFAULT 0,
    spellcooldown_3 INTEGER NOT NULL DEFAULT -1,
    spellcategory_3 INTEGER NOT NULL DEFAULT 0,
    spellcategorycooldown_3 INTEGER NOT NULL DEFAULT -1,
    spellid_4 INTEGER NOT NULL DEFAULT 0,
    spelltrigger_4 INTEGER NOT NULL DEFAULT 0,
    spellcharges_4 INTEGER NOT NULL DEFAULT 0,
    spellppmrate_4 DOUBLE PRECISION NOT NULL DEFAULT 0,
    spellcooldown_4 INTEGER NOT NULL DEFAULT -1,
    spellcategory_4 INTEGER NOT NULL DEFAULT 0,
    spellcategorycooldown_4 INTEGER NOT NULL DEFAULT -1,
    spellid_5 INTEGER NOT NULL DEFAULT 0,
    spelltrigger_5 INTEGER NOT NULL DEFAULT 0,
    spellcharges_5 INTEGER NOT NULL DEFAULT 0,
    spellppmrate_5 DOUBLE PRECISION NOT NULL DEFAULT 0,
    spellcooldown_5 INTEGER NOT NULL DEFAULT 0,
    spellcategory_5 INTEGER NOT NULL DEFAULT 0,
    spellcategorycooldown_5 INTEGER NOT NULL DEFAULT 0,
    bonding INTEGER NOT NULL DEFAULT 0,
    page_text INTEGER NOT NULL DEFAULT 0,
    page_language INTEGER NOT NULL DEFAULT 0,
    page_material INTEGER NOT NULL DEFAULT 0,
    start_quest INTEGER NOT NULL DEFAULT 0,
    lock_id INTEGER NOT NULL DEFAULT 0,
    material INTEGER NOT NULL DEFAULT 0,
    sheath INTEGER NOT NULL DEFAULT 0,
    random_property INTEGER NOT NULL DEFAULT 0,
    set_id INTEGER NOT NULL DEFAULT 0,
    max_durability INTEGER NOT NULL DEFAULT 0,
    area_bound INTEGER NOT NULL DEFAULT 0,
    map_bound INTEGER NOT NULL DEFAULT 0,
    duration INTEGER NOT NULL DEFAULT 0,
    bag_family INTEGER NOT NULL DEFAULT 0,
    disenchant_id INTEGER NOT NULL DEFAULT 0,
    food_type INTEGER NOT NULL DEFAULT 0,
    min_money_loot INTEGER NOT NULL DEFAULT 0,
    max_money_loot INTEGER NOT NULL DEFAULT 0,
    wrapped_gift INTEGER NOT NULL DEFAULT 0,
    extra_flags INTEGER NOT NULL DEFAULT 0,
    other_team_entry INTEGER NOT NULL DEFAULT 0,
    script_name TEXT,
    patch TEXT
);

-- Zone-based automatic spell/aura application. Defines spells that are auto-applied or
-- removed when entering specific areas, optionally gated by quest state, race, or gender.
-- Example: Warsong Gulch flag carrier debuffs.
CREATE TABLE world_spell_area (
    spell INTEGER NOT NULL,
    area INTEGER NOT NULL,
    quest_start INTEGER NOT NULL DEFAULT 0,
    quest_start_active INTEGER NOT NULL DEFAULT 0,
    quest_end INTEGER NOT NULL DEFAULT 0,
    aura_spell INTEGER NOT NULL DEFAULT 0,
    racemask INTEGER NOT NULL DEFAULT 0,
    gender INTEGER NOT NULL DEFAULT 2,
    autocast INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (spell, area)
);

-- Spell rank chains. Links each spell rank to its previous rank, the first rank in the chain,
-- and the rank number. Used to identify spell upgrades (e.g. Frostbolt Rank 1 → Rank 11).
CREATE TABLE world_spell_chain (
    spell_id INTEGER PRIMARY KEY,
    prev_spell INTEGER NOT NULL DEFAULT 0,
    first_spell INTEGER NOT NULL DEFAULT 0,
    rank INTEGER NOT NULL DEFAULT 0,
    req_spell INTEGER NOT NULL DEFAULT 0
);

-- Groups spells that share stacking rules. Spells in the same group cannot stack
-- (e.g. multiple ranks of the same buff). group_spell_id=0 means the group uses spell_id entries.
CREATE TABLE world_spell_group (
    group_id INTEGER NOT NULL,
    group_spell_id INTEGER NOT NULL DEFAULT 0,
    spell_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, spell_id)
);

-- Flat threat modifiers for spells. Overrides the default damage=threat model for specific
-- abilities (e.g. Sunder Armor generates fixed threat, Healing spells have a multiplier).
CREATE TABLE world_spell_threat (
    entry INTEGER PRIMARY KEY,
    threat INTEGER NOT NULL DEFAULT 0,
    multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
    ap_bonus DOUBLE PRECISION NOT NULL DEFAULT 0
);

-- Indexes for common lookups
CREATE INDEX idx_world_creature_spawn_id ON world_creature_spawn (id);
CREATE INDEX idx_world_creature_template_name ON world_creature_template (name);
CREATE INDEX idx_world_item_template_name ON world_item_template (name);
