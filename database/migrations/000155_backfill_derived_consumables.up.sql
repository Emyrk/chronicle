-- No-op. This migration originally backfilled the derived consumable catalog
-- but was removed from PR #280 in favor of rebuilding via DBC upload. Some
-- databases already recorded version 155, so the file must continue to exist
-- for golang-migrate to resolve the version history.
SELECT 1;
