BEGIN;

ALTER TABLE parse_score_receipts
    ALTER COLUMN cutoff DROP NOT NULL,
    ALTER COLUMN cohort_mode DROP NOT NULL;

-- Rollback can restore the retired schema, but the deleted member populations
-- are not recoverable. Recreated snapshots therefore have no members.
CREATE TABLE ranking_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    cutoff TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ,
    lookback_days INT NOT NULL DEFAULT 0,
    cohort_mode TEXT NOT NULL DEFAULT 'spec',
    policy_version SMALLINT NOT NULL DEFAULT 1,
    query_version SMALLINT NOT NULL DEFAULT 1,
    min_parser_version_num BIGINT NOT NULL DEFAULT 0,
    min_addon_version_num BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    source_row_count BIGINT NOT NULL DEFAULT 0,
    source_watermark TIMESTAMPTZ,
    member_count BIGINT NOT NULL DEFAULT 0
);
COMMENT ON COLUMN ranking_snapshots.member_count IS
    'Exact number of ranking_snapshot_members rows captured when the snapshot is published';

CREATE INDEX idx_rs_tenant_status
    ON ranking_snapshots (tenant_id, status);
CREATE INDEX idx_rs_tenant_lookback
    ON ranking_snapshots (tenant_id, lookback_days, published_at DESC NULLS LAST);
CREATE UNIQUE INDEX ranking_snapshots_published_key_idx
    ON ranking_snapshots (tenant_id, cutoff, lookback_days, cohort_mode, policy_version, query_version)
    WHERE status = 'published';

CREATE TABLE ranking_snapshot_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
    ranking_id UUID NOT NULL REFERENCES encounter_dps_rankings(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL,
    run_id UUID NOT NULL,
    instance_name TEXT NOT NULL,
    encounter_name TEXT NOT NULL,
    player_guid TEXT NOT NULL,
    player_class TEXT NOT NULL,
    player_spec TEXT NOT NULL,
    difficulty_name TEXT NOT NULL DEFAULT '',
    max_players SMALLINT NOT NULL DEFAULT 0,
    killed_at TIMESTAMPTZ NOT NULL,
    created_at_ranking TIMESTAMPTZ NOT NULL,
    damage_done BIGINT NOT NULL,
    healing_done BIGINT NOT NULL DEFAULT 0,
    absorbed_done BIGINT NOT NULL DEFAULT 0,
    duration_secs DOUBLE PRECISION NOT NULL,
    dps DOUBLE PRECISION NOT NULL,
    hps DOUBLE PRECISION NOT NULL DEFAULT 0,
    player_sub_spec TEXT NOT NULL DEFAULT '',
    UNIQUE (snapshot_id, ranking_id)
);

CREATE INDEX idx_ranking_snapshot_members_ranking_id
    ON ranking_snapshot_members (ranking_id);
CREATE INDEX idx_rsm_cohort_spec
    ON ranking_snapshot_members (
        snapshot_id, encounter_name, difficulty_name, max_players,
        player_class, player_spec, player_sub_spec
    );
CREATE INDEX idx_rsm_cohort_class
    ON ranking_snapshot_members (
        snapshot_id, encounter_name, difficulty_name, max_players, player_class
    );
CREATE INDEX idx_rsm_player
    ON ranking_snapshot_members (snapshot_id, player_guid);
CREATE INDEX idx_rsm_instance
    ON ranking_snapshot_members (snapshot_id, instance_id);

-- Only receipt-backed snapshot headers can be reconstructed without inventing
-- metadata. cutoff/window_start/cohort_mode were preserved by the up migration.
-- published_at is approximated by the receipt computation time because the
-- original publication timestamp was not retained.
INSERT INTO ranking_snapshots (
    id, tenant_id, cutoff, window_start, lookback_days, cohort_mode,
    policy_version, query_version, status, created_at, published_at
)
SELECT DISTINCT ON (receipt.snapshot_id)
    receipt.snapshot_id,
    receipt.tenant_id,
    receipt.cutoff,
    receipt.window_start,
    receipt.lookback_days,
    receipt.cohort_mode,
    receipt.policy_version,
    receipt.query_version,
    'published',
    receipt.created_at,
    receipt.computed_at
FROM parse_score_receipts receipt
WHERE receipt.snapshot_id IS NOT NULL
  AND receipt.cutoff IS NOT NULL
  AND receipt.cohort_mode IS NOT NULL
ORDER BY receipt.snapshot_id, receipt.computed_at DESC;

ALTER TABLE parse_score_receipts
    ADD CONSTRAINT parse_score_receipts_snapshot_id_fkey
    FOREIGN KEY (snapshot_id) REFERENCES ranking_snapshots(id) ON DELETE CASCADE;

-- Result-only orphan provenance may reference snapshots whose metadata was
-- already gone before this migration. Keep that provenance intact rather than
-- fabricating snapshot rows, so the parse_score_results FK cannot be restored
-- safely by this rollback.

COMMIT;
