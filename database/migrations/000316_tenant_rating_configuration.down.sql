BEGIN;

DROP TABLE rating_tenant_renown_bosses;
DROP TABLE rating_tenant_policies;
DROP FUNCTION bump_tenant_rating_revision();

COMMIT;
