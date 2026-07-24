-- Wipe pre-release parse snapshots.
-- Pre-release snapshots were built with evolving semantics (DPS-only membership,
-- best-per-player cohorts, hourly cutoffs); wipe for a clean start before first
-- real deploy. FK cascade handles members, but delete explicitly for clarity.
DELETE FROM ranking_snapshot_members;
DELETE FROM ranking_snapshots;
