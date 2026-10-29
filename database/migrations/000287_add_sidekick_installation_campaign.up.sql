BEGIN;

-- The landing campaign (utm_* params from the pairing browser's chronicle_utm
-- cookie) the installation was first approved under. Written once at device
-- approval and never overwritten; NULL when there was no campaign.
ALTER TABLE sidekick_installations
  ADD COLUMN utm_source TEXT CHECK (utm_source IS NULL OR char_length(utm_source) <= 100),
  ADD COLUMN utm_medium TEXT CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 100),
  ADD COLUMN utm_campaign TEXT CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 100),
  ADD COLUMN utm_content TEXT CHECK (utm_content IS NULL OR char_length(utm_content) <= 100);

COMMIT;
