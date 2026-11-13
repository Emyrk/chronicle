-- Exact variants use the same calculation and claim fencing as Combined.
-- name: EnqueueLeaderboardVariantPlayerBossBenchmark :exec
INSERT INTO leaderboard_variant_dirty_player_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, process_after)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @encounter_variant::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @process_after::timestamptz)
ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric) DO UPDATE
SET revision = leaderboard_variant_dirty_player_boss_benchmarks.revision + 1, dirtied_at = clock_timestamp(),
    process_after = LEAST(leaderboard_variant_dirty_player_boss_benchmarks.process_after, EXCLUDED.process_after);

-- name: ClaimLeaderboardVariantPlayerBossBenchmark :many
WITH candidates AS (
 SELECT * FROM leaderboard_variant_dirty_player_boss_benchmarks
 WHERE tenant_id = @tenant_id::uuid AND process_after <= clock_timestamp()
   AND retry_after <= clock_timestamp()
   AND (locked_until IS NULL OR locked_until <= clock_timestamp())
 ORDER BY process_after, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric
 LIMIT @limit_count::integer FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_variant_dirty_player_boss_benchmarks d SET claim_token = gen_random_uuid(), claimed_revision = d.revision,
    locked_until = clock_timestamp() + interval '15 minutes'
FROM candidates c WHERE d.tenant_id = c.tenant_id AND d.instance_name = c.instance_name AND d.difficulty_name = c.difficulty_name AND d.max_players = c.max_players AND d.encounter_name = c.encounter_name AND d.encounter_variant = c.encounter_variant AND d.player_class = c.player_class AND d.player_spec = c.player_spec AND d.player_sub_spec = c.player_sub_spec AND d.metric = c.metric
RETURNING d.*;

-- name: RetryLeaderboardVariantPlayerBossBenchmark :batchexec
UPDATE leaderboard_variant_dirty_player_boss_benchmarks
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = LEAST(attempts + 1, 30),
    retry_after = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST(attempts, 6)))::double precision)
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND encounter_variant = @encounter_variant::text AND player_class = @player_class::text AND player_spec = @player_spec::text AND player_sub_spec = @player_sub_spec::text AND metric = @metric::text AND claim_token = @claim_token::uuid AND claimed_revision = @claimed_revision::bigint;

-- name: EnqueueLeaderboardVariantPlayerBossSubject :exec
INSERT INTO leaderboard_variant_dirty_player_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid, process_after)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @encounter_variant::text, @player_class::text, @player_spec::text, @player_sub_spec::text, @metric::text, @realm_id::uuid, @player_guid::text, @process_after::timestamptz)
ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid) DO UPDATE
SET revision = leaderboard_variant_dirty_player_boss_subjects.revision + 1, dirtied_at = clock_timestamp(),
    process_after = LEAST(leaderboard_variant_dirty_player_boss_subjects.process_after, EXCLUDED.process_after);

-- name: ClaimLeaderboardVariantPlayerBossSubject :many
WITH candidates AS (
 SELECT * FROM leaderboard_variant_dirty_player_boss_subjects
 WHERE tenant_id = @tenant_id::uuid AND process_after <= clock_timestamp()
   AND retry_after <= clock_timestamp()
   AND (locked_until IS NULL OR locked_until <= clock_timestamp())
 ORDER BY process_after, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, player_class, player_spec, player_sub_spec, metric, realm_id, player_guid
 LIMIT @limit_count::integer FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_variant_dirty_player_boss_subjects d SET claim_token = gen_random_uuid(), claimed_revision = d.revision,
    locked_until = clock_timestamp() + interval '15 minutes'
FROM candidates c WHERE d.tenant_id = c.tenant_id AND d.instance_name = c.instance_name AND d.difficulty_name = c.difficulty_name AND d.max_players = c.max_players AND d.encounter_name = c.encounter_name AND d.encounter_variant = c.encounter_variant AND d.player_class = c.player_class AND d.player_spec = c.player_spec AND d.player_sub_spec = c.player_sub_spec AND d.metric = c.metric AND d.realm_id = c.realm_id AND d.player_guid = c.player_guid
RETURNING d.*;

-- name: RetryLeaderboardVariantPlayerBossSubject :batchexec
UPDATE leaderboard_variant_dirty_player_boss_subjects
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = LEAST(attempts + 1, 30),
    retry_after = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST(attempts, 6)))::double precision)
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND encounter_variant = @encounter_variant::text AND player_class = @player_class::text AND player_spec = @player_spec::text AND player_sub_spec = @player_sub_spec::text AND metric = @metric::text AND realm_id = @realm_id::uuid AND player_guid = @player_guid::text AND claim_token = @claim_token::uuid AND claimed_revision = @claimed_revision::bigint;

-- name: EnqueueLeaderboardVariantGuildBossBenchmark :exec
INSERT INTO leaderboard_variant_dirty_guild_boss_benchmarks (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, process_after)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @encounter_variant::text, @process_after::timestamptz)
ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant) DO UPDATE
SET revision = leaderboard_variant_dirty_guild_boss_benchmarks.revision + 1, dirtied_at = clock_timestamp(),
    process_after = LEAST(leaderboard_variant_dirty_guild_boss_benchmarks.process_after, EXCLUDED.process_after);

-- name: ClaimLeaderboardVariantGuildBossBenchmark :many
WITH candidates AS (
 SELECT * FROM leaderboard_variant_dirty_guild_boss_benchmarks
 WHERE tenant_id = @tenant_id::uuid AND process_after <= clock_timestamp()
   AND retry_after <= clock_timestamp()
   AND (locked_until IS NULL OR locked_until <= clock_timestamp())
 ORDER BY process_after, instance_name, difficulty_name, max_players, encounter_name, encounter_variant
 LIMIT @limit_count::integer FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_variant_dirty_guild_boss_benchmarks d SET claim_token = gen_random_uuid(), claimed_revision = d.revision,
    locked_until = clock_timestamp() + interval '15 minutes'
FROM candidates c WHERE d.tenant_id = c.tenant_id AND d.instance_name = c.instance_name AND d.difficulty_name = c.difficulty_name AND d.max_players = c.max_players AND d.encounter_name = c.encounter_name AND d.encounter_variant = c.encounter_variant
RETURNING d.*;

-- name: RetryLeaderboardVariantGuildBossBenchmark :batchexec
UPDATE leaderboard_variant_dirty_guild_boss_benchmarks
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = LEAST(attempts + 1, 30),
    retry_after = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST(attempts, 6)))::double precision)
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND encounter_variant = @encounter_variant::text AND claim_token = @claim_token::uuid AND claimed_revision = @claimed_revision::bigint;

-- name: EnqueueLeaderboardVariantGuildBossSubject :exec
INSERT INTO leaderboard_variant_dirty_guild_boss_subjects (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id, process_after)
VALUES (@tenant_id::uuid, @instance_name::text, @difficulty_name::text, @max_players::smallint, @encounter_name::text, @encounter_variant::text, @realm_id::uuid, @guild_id::uuid, @process_after::timestamptz)
ON CONFLICT (tenant_id, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id) DO UPDATE
SET revision = leaderboard_variant_dirty_guild_boss_subjects.revision + 1, dirtied_at = clock_timestamp(),
    process_after = LEAST(leaderboard_variant_dirty_guild_boss_subjects.process_after, EXCLUDED.process_after);

-- name: ClaimLeaderboardVariantGuildBossSubject :many
WITH candidates AS (
 SELECT * FROM leaderboard_variant_dirty_guild_boss_subjects
 WHERE tenant_id = @tenant_id::uuid AND process_after <= clock_timestamp()
   AND retry_after <= clock_timestamp()
   AND (locked_until IS NULL OR locked_until <= clock_timestamp())
 ORDER BY process_after, instance_name, difficulty_name, max_players, encounter_name, encounter_variant, realm_id, guild_id
 LIMIT @limit_count::integer FOR UPDATE SKIP LOCKED
)
UPDATE leaderboard_variant_dirty_guild_boss_subjects d SET claim_token = gen_random_uuid(), claimed_revision = d.revision,
    locked_until = clock_timestamp() + interval '15 minutes'
FROM candidates c WHERE d.tenant_id = c.tenant_id AND d.instance_name = c.instance_name AND d.difficulty_name = c.difficulty_name AND d.max_players = c.max_players AND d.encounter_name = c.encounter_name AND d.encounter_variant = c.encounter_variant AND d.realm_id = c.realm_id AND d.guild_id = c.guild_id
RETURNING d.*;

-- name: RetryLeaderboardVariantGuildBossSubject :batchexec
UPDATE leaderboard_variant_dirty_guild_boss_subjects
SET claim_token = NULL, claimed_revision = NULL, locked_until = NULL,
    attempts = LEAST(attempts + 1, 30),
    retry_after = clock_timestamp() + make_interval(secs => LEAST(300, 5 * power(2, LEAST(attempts, 6)))::double precision)
WHERE tenant_id = @tenant_id::uuid AND instance_name = @instance_name::text AND difficulty_name = @difficulty_name::text AND max_players = @max_players::smallint AND encounter_name = @encounter_name::text AND encounter_variant = @encounter_variant::text AND realm_id = @realm_id::uuid AND guild_id = @guild_id::uuid AND claim_token = @claim_token::uuid AND claimed_revision = @claimed_revision::bigint;

