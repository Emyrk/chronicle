BEGIN;

-- Healing metrics recorded before the Overhealing hook-order fix are wrong:
-- the hook that derives msg.Overheal ran AFTER the DPS tracker, so the
-- tracker saw Overheal == 0 and accumulated TOTAL healing instead of
-- effective healing. Every healing_done / hps value written to date is
-- therefore inflated.
--
-- Zero them out so the UI shows "no HPS parse" (no_metric_value) rather than
-- wrong numbers. Reparsing logs repopulates these columns with correct
-- effective-healing values. absorbed_done is intentionally left alone: the
-- Absorbed handler never read Overheal, so absorb attribution was always
-- correct. hps is zeroed as well because it was computed from the inflated
-- healing_done ((healing + absorbed) / duration).
UPDATE encounter_dps_rankings
SET healing_done = 0,
    hps          = 0
WHERE healing_done <> 0 OR hps <> 0;

-- Snapshot members are frozen copies of the rows above and carry the same
-- inflated values. Zero them too so HPS cohorts return no datapoints (the
-- cohort query filters hps > 0) instead of scoring against wrong data.
-- After reparsing, delete affected snapshots and re-backfill from the admin
-- Parsing tab to rebuild cohorts with corrected values.
UPDATE ranking_snapshot_members
SET healing_done = 0,
    hps          = 0
WHERE healing_done <> 0 OR hps <> 0;

COMMIT;
