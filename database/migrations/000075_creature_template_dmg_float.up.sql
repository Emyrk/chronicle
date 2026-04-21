ALTER TABLE world_creature_template
    ALTER COLUMN dmg_min TYPE DOUBLE PRECISION USING dmg_min::double precision,
    ALTER COLUMN dmg_max TYPE DOUBLE PRECISION USING dmg_max::double precision;
