BEGIN;

ALTER TABLE rating_boss_scores DROP COLUMN group_id;
DROP TABLE rating_realm_group_memberships;
DROP TABLE rating_realm_groups;
ALTER TABLE wow_server_realms DROP CONSTRAINT wow_server_realms_id_server_id_unique;

COMMIT;
