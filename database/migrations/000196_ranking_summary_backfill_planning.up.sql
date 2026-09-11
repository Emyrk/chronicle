BEGIN;

-- This control table stores bounded backfill plans only. Historical source and
-- summary tables are intentionally not scanned or modified during startup.
CREATE TABLE ranking_summary_backfills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    requested_by UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    target_summary_version SMALLINT NOT NULL,
    batch_size INTEGER NOT NULL,
    max_batches INTEGER NOT NULL,
    delay_ms INTEGER NOT NULL,
    preview_total_runs BIGINT NOT NULL,
    preview_missing_runs BIGINT NOT NULL,
    preview_stale_runs BIGINT NOT NULL,
    preview_current_runs BIGINT NOT NULL,
    preview_dirty_runs BIGINT NOT NULL,
    estimated_wal_bytes BIGINT,
    batches_completed INTEGER NOT NULL DEFAULT 0,
    runs_marked_dirty BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    last_progress_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    CONSTRAINT ranking_summary_backfills_status_check
        CHECK (status IN ('planned', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT ranking_summary_backfills_target_version_check CHECK (target_summary_version > 0),
    CONSTRAINT ranking_summary_backfills_batch_size_check CHECK (batch_size BETWEEN 1 AND 500),
    CONSTRAINT ranking_summary_backfills_max_batches_check CHECK (max_batches BETWEEN 1 AND 100),
    CONSTRAINT ranking_summary_backfills_delay_ms_check CHECK (delay_ms BETWEEN 100 AND 60000),
    CONSTRAINT ranking_summary_backfills_preview_counts_check CHECK (
        preview_total_runs >= 0 AND preview_missing_runs >= 0 AND
        preview_stale_runs >= 0 AND preview_current_runs >= 0 AND
        preview_dirty_runs >= 0 AND
        preview_total_runs = preview_missing_runs + preview_stale_runs + preview_current_runs AND
        preview_dirty_runs <= preview_total_runs
    ),
    CONSTRAINT ranking_summary_backfills_progress_check CHECK (
        batches_completed >= 0 AND batches_completed <= max_batches AND runs_marked_dirty >= 0
    ),
    CONSTRAINT ranking_summary_backfills_lifecycle_check CHECK (
        (status = 'planned' AND started_at IS NULL AND completed_at IS NULL) OR
        (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL) OR
        (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT ranking_summary_backfills_error_check CHECK (
        (last_error_at IS NULL AND error_message IS NULL) OR
        (last_error_at IS NOT NULL AND error_message IS NOT NULL)
    )
);

CREATE INDEX idx_ranking_summary_backfills_created_at
    ON ranking_summary_backfills (created_at DESC);

COMMIT;
