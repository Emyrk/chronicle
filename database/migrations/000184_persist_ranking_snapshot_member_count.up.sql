BEGIN;

-- Persist the exact number of members in each snapshot. The public snapshots
-- endpoint previously counted ranking_snapshot_members on every request, which
-- scanned millions of index entries across the returned snapshots.
ALTER TABLE ranking_snapshots
    ADD COLUMN member_count BIGINT NOT NULL DEFAULT 0;

-- Existing snapshots need their exact count once. New snapshots set this value
-- atomically when they transition to published.
UPDATE ranking_snapshots rs
SET member_count = counts.member_count
FROM (
    SELECT snapshot_id, COUNT(*)::bigint AS member_count
    FROM ranking_snapshot_members
    GROUP BY snapshot_id
) counts
WHERE counts.snapshot_id = rs.id;

COMMENT ON COLUMN ranking_snapshots.member_count IS
    'Exact number of ranking_snapshot_members rows captured when the snapshot is published';

COMMIT;
