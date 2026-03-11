DROP TABLE IF EXISTS world_spell_threat;
DROP TABLE IF EXISTS world_spell_group;
DROP TABLE IF EXISTS world_spell_chain;
DROP TABLE IF EXISTS world_spell_area;
DROP TABLE IF EXISTS world_item_template;
DROP TABLE IF EXISTS world_item_enchantment;
DROP TABLE IF EXISTS world_creature_template;
DROP TABLE IF EXISTS world_creature_spawn;
DROP TABLE IF EXISTS world_display_info;

-- Restore orphaned enum type that existed before this migration.
CREATE TYPE spell_school AS ENUM (
    'physical',
    'fire',
    'frost',
    'shadow',
    'arcane',
    'holy',
    'nature'
);
