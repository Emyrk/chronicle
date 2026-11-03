-- Leaky-bucket rate limits shared by every API replica. One row per
-- (limiter, subject) key, e.g. 'instance_search:user:<uuid>'. Rows are
-- refilled lazily on each take and deleted by a periodic cleanup job once idle.
CREATE TABLE rate_limit_buckets (
  key TEXT PRIMARY KEY,
  tokens DOUBLE PRECISION NOT NULL,
  -- Whether the most recent take was allowed. Lets one upsert both decide
  -- and report the decision.
  last_allowed BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_rate_limit_buckets_updated_at ON rate_limit_buckets (updated_at);

-- Token level after refilling at rate_per_second since updated_at, capped at
-- burst.
CREATE FUNCTION rate_limit_refill(
  tokens DOUBLE PRECISION,
  updated_at TIMESTAMPTZ,
  rate_per_second DOUBLE PRECISION,
  burst DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE sql STABLE AS $$
  SELECT LEAST(burst, tokens + GREATEST(EXTRACT(EPOCH FROM (now() - updated_at)), 0) * rate_per_second)
$$;
