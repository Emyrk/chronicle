-- Destructive retirement of rating and parse-scoring storage, excluding v1
-- performance rankings (encounter_dps_rankings, ranking_runs, rankings_instance_summaries). No down migration:
-- historical scores, memberships, and policies cannot be reconstructed from DDL.
-- Predeploy: export any data that must be retained, count production rows per table,
-- and assess locks/traffic. DROP TABLE takes ACCESS EXCLUSIVE locks and may block
-- service startup while waiting for long-running queries or transactions.
-- Preview: SELECT relname, n_live_tup FROM pg_stat_user_tables
--          WHERE relname ~ '(rating|ranking|parse_score)'
--            AND relname NOT IN ('encounter_dps_rankings', 'ranking_runs', 'rankings_instance_summaries');
BEGIN;

-- Triggers on source tables must stop writing retired dirty-work tables.
DROP TRIGGER IF EXISTS fixed_rating_dataset_revision ON datasets;
DROP TRIGGER IF EXISTS fixed_rating_realm_revision ON wow_server_realms;
DROP TRIGGER IF EXISTS fixed_rating_server_revision ON wow_servers;
DROP TRIGGER IF EXISTS fixed_rating_tenant_revision ON tenants;
DROP TRIGGER IF EXISTS mark_guild_renown_dirty ON guild_renown_kill_facts;
DROP TRIGGER IF EXISTS mark_player_renown_dirty ON renown_kill_facts;

-- Remove the four read views before their base tables.
DROP VIEW IF EXISTS guild_tenant_rating_boss_scores_evolving_read;
DROP VIEW IF EXISTS guild_tenant_rating_scope_scores_evolving_read;
DROP VIEW IF EXISTS player_tenant_rating_boss_scores_evolving_read;
DROP VIEW IF EXISTS player_tenant_rating_scope_scores_evolving_read;

-- Drop referencing tables before referenced tables (foreign keys use RESTRICT).
DROP TABLE IF EXISTS guild_rating_boss_scores;
DROP TABLE IF EXISTS guild_rating_scope_scores;
DROP TABLE IF EXISTS guild_tenant_rating_boss_scores;
DROP TABLE IF EXISTS guild_tenant_rating_boss_scores_evolving;
DROP TABLE IF EXISTS guild_tenant_rating_scope_scores;
DROP TABLE IF EXISTS guild_tenant_rating_scope_scores_evolving;
DROP TABLE IF EXISTS parse_score_memberships;
DROP TABLE IF EXISTS parse_score_receipts;
DROP TABLE IF EXISTS parse_score_results;
DROP TABLE IF EXISTS player_tenant_rating_boss_scores;
DROP TABLE IF EXISTS player_tenant_rating_boss_scores_evolving;
DROP TABLE IF EXISTS player_tenant_rating_scope_scores;
DROP TABLE IF EXISTS player_tenant_rating_scope_scores_evolving;
DROP TABLE IF EXISTS rating_boss_scores;
DROP TABLE IF EXISTS rating_config_revisions;
DROP TABLE IF EXISTS rating_dirty_mastery_subjects;
DROP TABLE IF EXISTS rating_dirty_observation_runs;
DROP TABLE IF EXISTS rating_dirty_renown_subjects;
DROP TABLE IF EXISTS rating_group_boss_policies;
DROP TABLE IF EXISTS rating_group_raid_policies;
DROP TABLE IF EXISTS rating_live_evidence_bootstraps;
DROP TABLE IF EXISTS rating_live_evidence_revisions;
DROP TABLE IF EXISTS rating_live_guild_observations;
DROP TABLE IF EXISTS rating_live_player_observations;
DROP TABLE IF EXISTS rating_mastery_accumulators;
DROP TABLE IF EXISTS rating_peak_cohort_denominators;
DROP TABLE IF EXISTS rating_peak_cohort_denominators_evolving;
DROP TABLE IF EXISTS rating_peak_cohort_pages;
DROP TABLE IF EXISTS rating_peak_cohort_pages_evolving;
DROP TABLE IF EXISTS rating_policy_scan_progress;
DROP TABLE IF EXISTS rating_realm_group_memberships;
DROP TABLE IF EXISTS rating_renown_template_bosses;
DROP TABLE IF EXISTS rating_scope_scores;
DROP TABLE IF EXISTS rating_stage_guild_observations;
DROP TABLE IF EXISTS rating_stage_guild_renown;
DROP TABLE IF EXISTS rating_stage_player_observations;
DROP TABLE IF EXISTS rating_stage_player_renown;
DROP TABLE IF EXISTS tenant_rating_copy_progress;
DROP TABLE IF EXISTS tenant_rating_read_states;
DROP TABLE IF EXISTS rating_dirty_peak_cohorts;
DROP TABLE IF EXISTS rating_group_policies;
DROP TABLE IF EXISTS rating_rebuild_checkpoints;
DROP TABLE IF EXISTS rating_renown_templates;
DROP TABLE IF EXISTS rating_realm_groups;
DROP TABLE IF EXISTS rating_score_generations;

-- The root-tenant rollout switch has no meaning without the ratings pipeline.
ALTER TABLE site_config DROP COLUMN root_tenant_ratings_disabled;

-- Functions are rating-owned, including triggers and rebuild entry points.
DROP FUNCTION IF EXISTS apply_rating_renown_template();
DROP FUNCTION IF EXISTS bump_fixed_rating_flavor_revision();
DROP FUNCTION IF EXISTS bump_rating_config_revision();
DROP FUNCTION IF EXISTS bump_rating_group_policy_version();
DROP FUNCTION IF EXISTS current_tenant_rating_policy(p_tenant_id uuid);
DROP FUNCTION IF EXISTS gate_rating_checkpoint_activation();
DROP FUNCTION IF EXISTS mark_live_guild_rating_dirty();
DROP FUNCTION IF EXISTS mark_live_player_rating_dirty();
DROP FUNCTION IF EXISTS mark_rating_renown_fact_dirty();
DROP FUNCTION IF EXISTS publish_rating_rebuild(p_generation_id uuid, p_tenant_id uuid);
DROP FUNCTION IF EXISTS start_rating_rebuild(p_tenant_id uuid, p_policy_version integer, p_as_of timestamp with time zone, p_source_cutoff timestamp with time zone);
DROP FUNCTION IF EXISTS start_tenant_rating_rebuild(p_tenant_id uuid, p_as_of timestamp with time zone, p_source_cutoff timestamp with time zone);
DROP FUNCTION IF EXISTS tenant_ratings_enabled(p_tenant_id uuid);


COMMIT;
