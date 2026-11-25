BEGIN;

SET LOCAL lock_timeout = '5s';

-- Metadata-only: no historical scan, rewrite, or backfill. Existing validated
-- previously accepted rows already satisfy this broader constraint. NOT VALID still
-- enforces the new domain on future inserts/updates. Locks fail fast.

ALTER TABLE leaderboard_variant_dirty_guild_boss_benchmarks
  DROP CONSTRAINT leaderboard_variant_dirty_guild_boss_be_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_dirty_guild_boss_be_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_dirty_guild_boss_subjects
  DROP CONSTRAINT leaderboard_variant_dirty_guild_boss_su_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_dirty_guild_boss_su_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_dirty_player_boss_benchmarks
  DROP CONSTRAINT leaderboard_variant_dirty_player_boss_b_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_dirty_player_boss_b_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_dirty_player_boss_subjects
  DROP CONSTRAINT leaderboard_variant_dirty_player_boss_s_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_dirty_player_boss_s_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_guild_boss_benchmarks
  DROP CONSTRAINT leaderboard_variant_guild_boss_benchmar_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_guild_boss_benchmar_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_guild_boss_observations
  DROP CONSTRAINT leaderboard_variant_guild_boss_observat_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_guild_boss_observat_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_guild_boss_subjects
  DROP CONSTRAINT leaderboard_variant_guild_boss_subjects_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_guild_boss_subjects_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_player_boss_benchmarks
  DROP CONSTRAINT leaderboard_variant_player_boss_benchma_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_player_boss_benchma_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_player_boss_subjects
  DROP CONSTRAINT leaderboard_variant_player_boss_subject_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_player_boss_subject_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE leaderboard_variant_player_observations
  DROP CONSTRAINT leaderboard_variant_player_observations_encounter_variant_check,
  ADD CONSTRAINT leaderboard_variant_player_observations_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE parse_variant_memberships
  DROP CONSTRAINT parse_variant_memberships_encounter_variant_check,
  ADD CONSTRAINT parse_variant_memberships_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

ALTER TABLE parse_variant_results
  DROP CONSTRAINT parse_variant_results_encounter_variant_check,
  ADD CONSTRAINT parse_variant_results_encounter_variant_check CHECK (encounter_variant IN ('normal', 'medium', 'hard', 'lights_0', 'lights_1', 'lights_2', 'lights_3', 'lights_4', 'towers_0', 'towers_1', 'towers_2', 'towers_3', 'towers_4')) NOT VALID;

COMMIT;
