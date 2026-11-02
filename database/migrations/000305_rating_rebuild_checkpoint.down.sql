BEGIN;
DROP FUNCTION publish_rating_rebuild(UUID, UUID);
DROP TRIGGER rating_checkpoint_activation ON rating_score_generations;
DROP FUNCTION gate_rating_checkpoint_activation();
DROP FUNCTION start_rating_rebuild(UUID, INT, TIMESTAMPTZ, TIMESTAMPTZ);
DROP TABLE rating_rebuild_checkpoints;
DROP TRIGGER rating_raid_policy_revision ON rating_group_raid_policies;
DROP TRIGGER rating_boss_policy_revision ON rating_group_boss_policies;
DROP TRIGGER rating_policy_revision ON rating_group_policies;
DROP TRIGGER rating_membership_revision ON rating_realm_group_memberships;
DROP TRIGGER rating_group_revision ON rating_realm_groups;
DROP FUNCTION bump_rating_config_revision();
DROP TABLE rating_config_revisions;
CREATE FUNCTION lock_rating_rebuild_config() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(1131453276, 1);
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER rating_group_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE ON rating_realm_groups
    FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_membership_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE ON rating_realm_group_memberships
    FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE ON rating_group_policies
    FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_boss_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE ON rating_group_boss_policies
    FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
CREATE TRIGGER rating_raid_policy_rebuild_lock BEFORE INSERT OR UPDATE OR DELETE ON rating_group_raid_policies
    FOR EACH ROW EXECUTE FUNCTION lock_rating_rebuild_config();
COMMIT;
