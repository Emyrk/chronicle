ALTER TABLE world_creature_template
    ALTER COLUMN dmg_min TYPE INTEGER USING dmg_min::integer,
    ALTER COLUMN dmg_max TYPE INTEGER USING dmg_max::integer;
