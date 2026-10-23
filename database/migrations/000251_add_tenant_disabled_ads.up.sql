ALTER TABLE tenants
    ADD COLUMN disabled_ads TEXT[] NOT NULL DEFAULT '{}';
