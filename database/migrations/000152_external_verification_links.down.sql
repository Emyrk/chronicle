DROP TABLE external_character_link_syncs;
ALTER TABLE user_character_links DROP COLUMN link_source;
ALTER TABLE tenants DROP COLUMN external_verification;
