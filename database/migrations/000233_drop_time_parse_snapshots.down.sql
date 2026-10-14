-- WARNING: this rollback recreates the empty snapshot schema only. Snapshot
-- metadata deleted by the up migration cannot be recovered.
BEGIN;

CREATE TABLE time_parse_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    cutoff TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ,
    lookback_days INT NOT NULL DEFAULT 0,
    policy_version SMALLINT NOT NULL DEFAULT 1,
    query_version SMALLINT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    source_row_count BIGINT NOT NULL DEFAULT 0,
    source_watermark TIMESTAMPTZ,
    source_fingerprint BIGINT NOT NULL DEFAULT 0,
    CHECK (status != 'published' OR published_at IS NOT NULL)
);
CREATE INDEX idx_tps_tenant_status ON time_parse_snapshots (tenant_id, status);
CREATE INDEX idx_tps_tenant_lookback ON time_parse_snapshots
    (tenant_id, lookback_days, published_at DESC NULLS LAST);
CREATE UNIQUE INDEX time_parse_snapshots_published_key_idx
    ON time_parse_snapshots (tenant_id, cutoff, lookback_days, policy_version, query_version)
    WHERE status = 'published';

COMMIT;
