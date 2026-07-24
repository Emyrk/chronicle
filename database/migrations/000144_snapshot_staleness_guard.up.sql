-- Add staleness guard columns to ranking_snapshots.
-- source_row_count: number of eligible encounter_dps_rankings rows at publication time.
-- source_watermark: max(created_at) of eligible source rows at publication time.
-- Used to skip redundant snapshot publication when source data is unchanged.
ALTER TABLE ranking_snapshots ADD COLUMN source_row_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE ranking_snapshots ADD COLUMN source_watermark TIMESTAMPTZ;
