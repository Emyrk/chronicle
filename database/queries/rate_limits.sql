-- name: TakeRateLimitTokens :one
-- Atomically refills a leaky bucket by the time since its last update
-- (capped at burst) and takes cost tokens if enough are available. A new
-- bucket starts full. A refused take still stores the refilled level, so
-- tokens never go negative. A negative cost refunds tokens, still capped at
-- burst. The row lock taken by the upsert serializes concurrent takes on the
-- same key.
INSERT INTO rate_limit_buckets (key, tokens, last_allowed, updated_at)
VALUES (
  sqlc.arg(key)::text,
  CASE WHEN sqlc.arg(burst)::float8 >= sqlc.arg(cost)::float8
    THEN LEAST(sqlc.arg(burst)::float8, sqlc.arg(burst)::float8 - sqlc.arg(cost)::float8)
    ELSE sqlc.arg(burst)::float8 END,
  sqlc.arg(burst)::float8 >= sqlc.arg(cost)::float8,
  now()
)
ON CONFLICT (key) DO UPDATE SET
  tokens = CASE
    WHEN rate_limit_refill(rate_limit_buckets.tokens, rate_limit_buckets.updated_at, sqlc.arg(rate_per_second)::float8, sqlc.arg(burst)::float8) >= sqlc.arg(cost)::float8
    THEN LEAST(sqlc.arg(burst)::float8, rate_limit_refill(rate_limit_buckets.tokens, rate_limit_buckets.updated_at, sqlc.arg(rate_per_second)::float8, sqlc.arg(burst)::float8) - sqlc.arg(cost)::float8)
    ELSE rate_limit_refill(rate_limit_buckets.tokens, rate_limit_buckets.updated_at, sqlc.arg(rate_per_second)::float8, sqlc.arg(burst)::float8)
  END,
  last_allowed = rate_limit_refill(rate_limit_buckets.tokens, rate_limit_buckets.updated_at, sqlc.arg(rate_per_second)::float8, sqlc.arg(burst)::float8) >= sqlc.arg(cost)::float8,
  updated_at = now()
RETURNING last_allowed AS allowed, tokens;

-- name: PeekRateLimitTokens :one
-- Returns a bucket's current (refilled) token level without changing it. A
-- bucket that does not exist yet is full.
SELECT COALESCE(
  (SELECT rate_limit_refill(b.tokens, b.updated_at, sqlc.arg(rate_per_second)::float8, sqlc.arg(burst)::float8)
   FROM rate_limit_buckets b WHERE b.key = sqlc.arg(key)::text),
  sqlc.arg(burst)::float8
)::float8 AS tokens;

-- name: DeleteIdleRateLimitBuckets :execrows
-- Removes buckets untouched since the cutoff. Callers pick a cutoff longer
-- than any bucket takes to refill, so deleting a bucket never changes a limit.
DELETE FROM rate_limit_buckets WHERE updated_at < sqlc.arg(idle_before)::timestamptz;
