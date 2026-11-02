BEGIN;

-- Rebuilds and every configuration mutation share a transaction-scoped lock.
-- This fences a long-running snapshot from publishing after a realm move or
-- policy edit. The initial implementation serializes all tenants; a future
-- per-tenant lock may replace it after measuring production rebuild duration.
CREATE FUNCTION lock_rating_rebuild_config() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(1131453276, 1);
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_group_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE
    ON rating_realm_groups FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_membership_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE
    ON rating_realm_group_memberships FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE
    ON rating_group_policies FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_boss_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE
    ON rating_group_boss_policies FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();

COMMIT;
