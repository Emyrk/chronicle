-- name: TryAcquireAdvisoryLock :one
SELECT pg_try_advisory_lock(@lock_key)::boolean;

-- name: ReleaseAdvisoryLock :one
SELECT pg_advisory_unlock(@lock_key)::boolean;
