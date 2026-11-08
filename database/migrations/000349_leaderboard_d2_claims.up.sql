BEGIN;
-- D2 only. Producers never change a claim token or slide an existing due time.
-- Source/evidence tables remain untouched. New dirty columns contain only local
-- work ownership/retry metadata, never leaderboard policy versions.

ALTER TABLE leaderboard_dirty_player_boss_benchmarks
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_player_boss_benchmarks_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_player_boss_subjects
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_player_boss_subjects_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_guild_boss_benchmarks
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_guild_boss_benchmarks_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_guild_boss_subjects
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_guild_boss_subjects_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_guild_clear_benchmarks
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_guild_clear_benchmarks_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_guild_clear_subjects
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_guild_clear_subjects_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_player_renown
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_player_renown_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

ALTER TABLE leaderboard_dirty_guild_renown
 ADD COLUMN claim_token uuid,
 ADD COLUMN claimed_revision bigint,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN retry_after timestamptz NOT NULL DEFAULT '-infinity',
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 ADD CONSTRAINT leaderboard_dirty_guild_renown_claim_complete CHECK (
   (claim_token IS NULL AND claimed_revision IS NULL AND locked_until IS NULL) OR
   (claim_token IS NOT NULL AND claimed_revision IS NOT NULL AND claimed_revision > 0 AND locked_until IS NOT NULL)
 );

COMMIT;
