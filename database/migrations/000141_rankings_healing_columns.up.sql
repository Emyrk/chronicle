-- Add healing metrics to encounter_dps_rankings for HPS leaderboards.
-- healing_done is effective healing only (overheal subtracted).
-- absorbed_done is damage prevented by absorb shields, attributed to the caster.
-- hps = (healing_done + absorbed_done) / duration_secs.
ALTER TABLE encounter_dps_rankings
    ADD COLUMN healing_done BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN absorbed_done BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN hps DOUBLE PRECISION NOT NULL DEFAULT 0;
